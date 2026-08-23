#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <WebKit/WebKit.h>
#import "PCSSStore.h"

static NSString *const PCSSScheme = @"pcss";
static NSString *const PCSSCompToxKeychainService = @"io.github.must-bethe-water.pcss.comptox";
static NSString *const PCSSLegacyCompToxKeychainService = @"com.pcss.inventory.comptox";

@interface PCSSSchemeHandler : NSObject <WKURLSchemeHandler>
@property(nonatomic, strong) NSURL *uiRoot;
@property(nonatomic, strong) NSMutableDictionary<NSValue *, NSMutableArray<NSURLSessionDataTask *> *> *networkTasks;
@property(nonatomic, strong) NSLock *lock;
@property(nonatomic, strong) PCSSStore *store;
@property(nonatomic) dispatch_queue_t pubChemRateQueue;
@property(nonatomic) NSTimeInterval nextPubChemRequestTime;
- (instancetype)initWithUIRoot:(NSURL *)uiRoot store:(PCSSStore *)store;
@end

@implementation PCSSSchemeHandler

- (instancetype)initWithUIRoot:(NSURL *)uiRoot store:(PCSSStore *)store {
    self = [super init];
    if (self) {
        _uiRoot = uiRoot;
        _networkTasks = [NSMutableDictionary dictionary];
        _lock = [[NSLock alloc] init];
        _store = store;
        _pubChemRateQueue = dispatch_queue_create("io.github.must-bethe-water.pcss.pubchem-rate", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

- (void)resumePubChemTask:(NSURLSessionDataTask *)task {
    dispatch_async(self.pubChemRateQueue, ^{
        NSTimeInterval now = NSDate.date.timeIntervalSince1970;
        NSTimeInterval scheduled = MAX(now, self.nextPubChemRequestTime);
        self.nextPubChemRequestTime = scheduled + 0.25;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)((scheduled - now) * NSEC_PER_SEC)), self.pubChemRateQueue, ^{ [task resume]; });
    });
}

- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)schemeTask {
    NSURL *url = schemeTask.request.URL;
    if (!url) {
        [self failTask:schemeTask message:@"Invalid application URL"];
    } else if ([url.path isEqualToString:@"/api/pubchem"]) {
        [self lookupPubChem:url task:schemeTask];
    } else if ([url.path isEqualToString:@"/api/chemistry"]) {
        [self lookupChemistry:url task:schemeTask];
    } else if ([url.path isEqualToString:@"/api/structure"]) {
        [self lookupStructure:url task:schemeTask];
    } else if ([url.path isEqualToString:@"/api/inventory"]) {
        [self handleInventory:schemeTask];
    } else if ([url.path isEqualToString:@"/api/inventory/export"]) {
        [self handleInventoryExport:schemeTask];
    } else if ([url.path isEqualToString:@"/api/inventory/import"]) {
        [self handleInventoryImport:schemeTask];
    } else if ([url.path isEqualToString:@"/api/settings/comptox"]) {
        [self handleCompToxSettings:schemeTask];
    } else {
        [self serveAsset:url task:schemeTask];
    }
}

- (void)lookupStructure:(NSURL *)url task:(id<WKURLSchemeTask>)schemeTask {
    NSString *cas = [self queryValue:@"cas" fromURL:url];
    if (![self isValidCAS:cas]) {
        [self json:schemeTask url:url status:400 value:@{ @"error": @"invalid_cas" }];
        return;
    }
    NSData *cached = [self.store cachedStructureForCAS:cas];
    if (cached.length) {
        [self respond:schemeTask url:url status:200 mimeType:@"image/png" data:cached];
        return;
    }

    NSString *escaped = [cas stringByAddingPercentEncodingWithAllowedCharacters:NSCharacterSet.URLPathAllowedCharacterSet];
    NSString *endpoint = [NSString stringWithFormat:@"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/%@/PNG?record_type=2d&image_size=large", escaped];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:endpoint]];
    [request setValue:@"image/png" forHTTPHeaderField:@"Accept"];
    [request setValue:@"PCSS/1.0 (macOS; local-first inventory)" forHTTPHeaderField:@"User-Agent"];
    request.timeoutInterval = 20;

    [self beginTask:schemeTask];
    __weak typeof(self) weakSelf = self;
    NSURLSessionDataTask *dataTask = [NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        if (!self) return;
        BOOL active = [self finishTask:schemeTask];
        if (!active || (error && error.code == NSURLErrorCancelled)) return;

        NSHTTPURLResponse *http = (NSHTTPURLResponse *)response;
        if ([http isKindOfClass:NSHTTPURLResponse.class] && http.statusCode == 404) {
            [self json:schemeTask url:url status:404 value:@{ @"error": @"structure_not_found" }];
            return;
        }
        NSString *contentType = [http.allHeaderFields[@"Content-Type"] lowercaseString];
        if (error || ![http isKindOfClass:NSHTTPURLResponse.class] || http.statusCode < 200 || http.statusCode >= 300 || !data.length || ![contentType hasPrefix:@"image/"]) {
            [self json:schemeTask url:url status:503 value:@{ @"error": @"upstream_error" }];
            return;
        }
        [self.store cacheStructureData:data forCAS:cas error:nil];
        [self respond:schemeTask url:url status:200 mimeType:@"image/png" data:data];
    }];

    [self addNetworkTask:dataTask forSchemeTask:schemeTask];
    [self resumePubChemTask:dataTask];
}

- (void)handleInventory:(id<WKURLSchemeTask>)schemeTask {
    NSString *method = schemeTask.request.HTTPMethod.uppercaseString ?: @"GET";
    NSError *error = nil;
    if ([method isEqualToString:@"GET"]) {
        NSArray *chemicals = [self.store allChemicals:&error];
        if (!chemicals) { [self json:schemeTask url:schemeTask.request.URL status:500 value:@{ @"error": error.localizedDescription ?: @"read_failed" }]; return; }
        [self json:schemeTask url:schemeTask.request.URL status:200 value:@{ @"schemaVersion": @1, @"initialized": @(self.store.isInventoryInitialized), @"chemicals": chemicals }];
        return;
    }
    if ([method isEqualToString:@"PUT"]) {
        id body = [NSJSONSerialization JSONObjectWithData:schemeTask.request.HTTPBody ?: NSData.data options:0 error:&error];
        NSArray *chemicals = [body isKindOfClass:NSDictionary.class] ? body[@"chemicals"] : nil;
        BOOL backup = [body[@"createBackup"] boolValue];
        if (!chemicals || ![self.store replaceChemicals:chemicals createBackup:backup error:&error]) {
            [self json:schemeTask url:schemeTask.request.URL status:400 value:@{ @"error": error.localizedDescription ?: @"invalid_inventory" }];
            return;
        }
        [self json:schemeTask url:schemeTask.request.URL status:200 value:@{ @"saved": @YES, @"count": @(chemicals.count) }];
        return;
    }
    [self json:schemeTask url:schemeTask.request.URL status:405 value:@{ @"error": @"method_not_allowed" }];
}

- (void)handleInventoryExport:(id<WKURLSchemeTask>)schemeTask {
    if (![schemeTask.request.HTTPMethod.uppercaseString isEqualToString:@"POST"]) {
        [self json:schemeTask url:schemeTask.request.URL status:405 value:@{ @"error": @"method_not_allowed" }]; return;
    }
    NSDictionary *body = [NSJSONSerialization JSONObjectWithData:schemeTask.request.HTTPBody ?: NSData.data options:0 error:nil];
    NSString *format = [body[@"format"] lowercaseString];
    if (![@[@"json", @"csv"] containsObject:format]) { [self json:schemeTask url:schemeTask.request.URL status:400 value:@{ @"error": @"invalid_format" }]; return; }
    dispatch_async(dispatch_get_main_queue(), ^{
        NSSavePanel *panel = [NSSavePanel savePanel];
        panel.nameFieldStringValue = [NSString stringWithFormat:@"PCSS-inventory.%@", format];
        panel.canCreateDirectories = YES;
        if ([panel runModal] != NSModalResponseOK) { [self json:schemeTask url:schemeTask.request.URL status:200 value:@{ @"cancelled": @YES }]; return; }
        NSError *error = nil;
        NSData *data = [self.store exportDataForFormat:format error:&error];
        BOOL saved = data && [data writeToURL:panel.URL options:NSDataWritingAtomic error:&error];
        [self json:schemeTask url:schemeTask.request.URL status:saved ? 200 : 500 value:saved ? @{ @"saved": @YES, @"path": panel.URL.path ?: @"" } : @{ @"error": error.localizedDescription ?: @"export_failed" }];
    });
}

- (void)handleInventoryImport:(id<WKURLSchemeTask>)schemeTask {
    if (![schemeTask.request.HTTPMethod.uppercaseString isEqualToString:@"POST"]) {
        [self json:schemeTask url:schemeTask.request.URL status:405 value:@{ @"error": @"method_not_allowed" }]; return;
    }
    NSDictionary *requestBody = [NSJSONSerialization JSONObjectWithData:schemeTask.request.HTTPBody ?: NSData.data options:0 error:nil];
    BOOL chinese = [requestBody[@"language"] isEqualToString:@"zh"];
    dispatch_async(dispatch_get_main_queue(), ^{
        NSOpenPanel *panel = [NSOpenPanel openPanel];
        panel.allowsMultipleSelection = NO;
        panel.canChooseDirectories = NO;
        if ([panel runModal] != NSModalResponseOK) { [self json:schemeTask url:schemeTask.request.URL status:200 value:@{ @"cancelled": @YES }]; return; }
        NSString *format = panel.URL.pathExtension.lowercaseString;
        NSError *error = nil;
        NSData *data = [NSData dataWithContentsOfURL:panel.URL options:0 error:&error];
        NSArray *imported = data ? [self.store chemicalsFromImportData:data format:format error:&error] : nil;
        NSArray *current = imported ? [self.store allChemicals:&error] : nil;
        if (!imported || !current) { [self json:schemeTask url:schemeTask.request.URL status:400 value:@{ @"error": error.localizedDescription ?: @"import_failed" }]; return; }
        NSAlert *choice = [[NSAlert alloc] init];
        choice.messageText = chinese ? @"如何导入库存？" : @"How should this inventory be imported?";
        choice.informativeText = chinese ? @"合并会保留当前词条并按记录 ID 更新；替换会先用自动备份保护当前库存，再以文件内容覆盖。" : @"Merge keeps current records and updates matching record IDs. Replace first backs up the current inventory, then uses only the file contents.";
        [choice addButtonWithTitle:chinese ? @"合并" : @"Merge"];
        [choice addButtonWithTitle:chinese ? @"替换" : @"Replace"];
        [choice addButtonWithTitle:chinese ? @"取消" : @"Cancel"];
        NSModalResponse selection = [choice runModal];
        if (selection == NSAlertThirdButtonReturn) { [self json:schemeTask url:schemeTask.request.URL status:200 value:@{ @"cancelled": @YES }]; return; }
        NSMutableDictionary *byID = [NSMutableDictionary dictionary];
        for (NSDictionary *chemical in current) byID[chemical[@"id"]] = chemical;
        for (NSDictionary *chemical in imported) byID[chemical[@"id"]] = chemical;
        NSArray *result = selection == NSAlertSecondButtonReturn ? imported : byID.allValues;
        NSArray *merged = [result sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) { return [right[@"createdAt"] compare:left[@"createdAt"]]; }];
        if (![self.store replaceChemicals:merged createBackup:YES error:&error]) { [self json:schemeTask url:schemeTask.request.URL status:500 value:@{ @"error": error.localizedDescription ?: @"import_failed" }]; return; }
        [self json:schemeTask url:schemeTask.request.URL status:200 value:@{ @"imported": @(imported.count), @"chemicals": merged }];
    });
}

- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)schemeTask {
    NSValue *key = [NSValue valueWithNonretainedObject:schemeTask];
    [self.lock lock];
    NSArray<NSURLSessionDataTask *> *tasks = self.networkTasks[key];
    [self.networkTasks removeObjectForKey:key];
    [self.lock unlock];
    for (NSURLSessionDataTask *task in tasks) [task cancel];
}

- (void)beginTask:(id<WKURLSchemeTask>)schemeTask {
    NSValue *key = [NSValue valueWithNonretainedObject:schemeTask];
    [self.lock lock];
    self.networkTasks[key] = [NSMutableArray array];
    [self.lock unlock];
}

- (void)addNetworkTask:(NSURLSessionDataTask *)dataTask forSchemeTask:(id<WKURLSchemeTask>)schemeTask {
    NSValue *key = [NSValue valueWithNonretainedObject:schemeTask];
    [self.lock lock];
    [self.networkTasks[key] addObject:dataTask];
    [self.lock unlock];
}

- (BOOL)finishTask:(id<WKURLSchemeTask>)schemeTask {
    NSValue *key = [NSValue valueWithNonretainedObject:schemeTask];
    [self.lock lock];
    BOOL active = self.networkTasks[key] != nil;
    [self.networkTasks removeObjectForKey:key];
    [self.lock unlock];
    return active;
}

- (void)serveAsset:(NSURL *)url task:(id<WKURLSchemeTask>)schemeTask {
    NSString *relativePath = url.path.stringByRemovingPercentEncoding ?: url.path;
    relativePath = [relativePath stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"/"]];
    if (relativePath.length == 0) relativePath = @"index.html";
    if ([[relativePath pathComponents] containsObject:@".."]) {
        [self failTask:schemeTask message:@"Invalid asset path"];
        return;
    }

    NSURL *fileURL = [self.uiRoot URLByAppendingPathComponent:relativePath];
    NSData *data = [NSData dataWithContentsOfURL:fileURL];
    if (!data) {
        [self respond:schemeTask url:url status:404 mimeType:@"text/plain" data:[@"Not found" dataUsingEncoding:NSUTF8StringEncoding]];
        return;
    }
    [self respond:schemeTask url:url status:200 mimeType:[self mimeTypeForExtension:fileURL.pathExtension] data:data];
}

- (void)lookupPubChem:(NSURL *)url task:(id<WKURLSchemeTask>)schemeTask {
    NSURLComponents *components = [NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];
    __block NSString *cas = @"";
    [components.queryItems enumerateObjectsUsingBlock:^(NSURLQueryItem *item, NSUInteger index, BOOL *stop) {
        if ([item.name isEqualToString:@"cas"]) {
            cas = [item.value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] ?: @"";
            *stop = YES;
        }
    }];

    if (![self isValidCAS:cas]) {
        [self json:schemeTask url:url status:400 value:@{ @"error": @"invalid_cas" }];
        return;
    }

    NSString *escaped = [cas stringByAddingPercentEncodingWithAllowedCharacters:NSCharacterSet.URLPathAllowedCharacterSet];
    NSString *endpoint = [NSString stringWithFormat:@"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/%@/property/Title,MolecularFormula,IUPACName/JSON", escaped];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:endpoint]];
    [request setValue:@"application/json" forHTTPHeaderField:@"Accept"];
    request.timeoutInterval = 20;

    [self beginTask:schemeTask];
    __weak typeof(self) weakSelf = self;
    NSURLSessionDataTask *dataTask = [NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        if (!self) return;
        BOOL active = [self finishTask:schemeTask];
        if (!active || (error && error.code == NSURLErrorCancelled)) return;

        NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
        if (error || ![httpResponse isKindOfClass:NSHTTPURLResponse.class] || !data) {
            [self json:schemeTask url:url status:503 value:@{ @"error": @"upstream_error" }];
            return;
        }
        if (httpResponse.statusCode == 404) {
            [self json:schemeTask url:url status:404 value:@{ @"error": @"not_found" }];
            return;
        }

        NSDictionary *root = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        NSArray *properties = [root[@"PropertyTable"] objectForKey:@"Properties"];
        NSDictionary *compound = properties.firstObject;
        NSString *name = compound[@"Title"] ?: compound[@"IUPACName"];
        NSString *formula = compound[@"MolecularFormula"];
        if (httpResponse.statusCode < 200 || httpResponse.statusCode >= 300 || !name || !formula) {
            [self json:schemeTask url:url status:503 value:@{ @"error": @"upstream_error" }];
            return;
        }

        NSMutableDictionary *result = [@{ @"name": name, @"formula": formula, @"source": @"PubChem" } mutableCopy];
        if (compound[@"CID"]) result[@"cid"] = compound[@"CID"];
        [self json:schemeTask url:url status:200 value:result];
    }];

    [self addNetworkTask:dataTask forSchemeTask:schemeTask];
    [self resumePubChemTask:dataTask];
}

- (NSString *)queryValue:(NSString *)name fromURL:(NSURL *)url {
    for (NSURLQueryItem *item in [NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO].queryItems) {
        if ([item.name isEqualToString:name]) return [item.value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] ?: @"";
    }
    return @"";
}

- (NSMutableDictionary *)source:(NSString *)identifier status:(NSString *)status value:(NSString *)value url:(NSString *)url {
    NSMutableDictionary *result = [@{ @"id": identifier, @"status": status } mutableCopy];
    if (value.length) result[@"identifier"] = value;
    if (url.length) result[@"url"] = url;
    return result;
}

- (NSURLSessionDataTask *)fetchJSON:(NSString *)endpoint method:(NSString *)method headers:(NSDictionary *)headers body:(NSData *)body completion:(void (^)(id, NSError *))completion {
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:endpoint]];
    request.HTTPMethod = method ?: @"GET";
    request.HTTPBody = body;
    request.timeoutInterval = 18;
    [request setValue:@"application/json" forHTTPHeaderField:@"Accept"];
    [request setValue:@"PCSS/1.0 (macOS; local-first inventory)" forHTTPHeaderField:@"User-Agent"];
    for (NSString *key in headers) [request setValue:headers[key] forHTTPHeaderField:key];
    return [NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSHTTPURLResponse *http = (NSHTTPURLResponse *)response;
        if (error || ![http isKindOfClass:NSHTTPURLResponse.class] || http.statusCode < 200 || http.statusCode >= 300 || !data) {
            completion(nil, error ?: [NSError errorWithDomain:@"PCSS" code:http.statusCode userInfo:nil]);
            return;
        }
        NSError *jsonError = nil;
        id payload = [NSJSONSerialization JSONObjectWithData:data options:0 error:&jsonError];
        completion(payload, jsonError);
    }];
}

- (void)lookupChemistry:(NSURL *)url task:(id<WKURLSchemeTask>)schemeTask {
    NSString *cas = [self queryValue:@"cas" fromURL:url];
    if (![self isValidCAS:cas]) {
        NSString *name = [self queryValue:@"name" fromURL:url];
        if (![self isValidCompoundName:name]) { [self json:schemeTask url:url status:400 value:@{ @"error": @"invalid_query" }]; return; }
        [self resolveCompoundName:name responseURL:url task:schemeTask];
        return;
    }

    [self beginTask:schemeTask];
    NSString *escaped = [cas stringByAddingPercentEncodingWithAllowedCharacters:NSCharacterSet.URLPathAllowedCharacterSet];
    NSString *endpoint = [NSString stringWithFormat:@"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/%@/property/Title,MolecularFormula,IUPACName,InChIKey,CanonicalSMILES,MolecularWeight,ExactMass/JSON", escaped];
    __weak typeof(self) weakSelf = self;
    NSURLSessionDataTask *pubchemTask = [self fetchJSON:endpoint method:@"GET" headers:@{} body:nil completion:^(id payload, NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        if (!self) return;
        NSDictionary *compound = [[payload valueForKeyPath:@"PropertyTable.Properties"] firstObject];
        NSString *name = compound[@"Title"] ?: compound[@"IUPACName"];
        NSString *formula = compound[@"MolecularFormula"];
        if (error || !name.length || !formula.length) {
            if ([self finishTask:schemeTask]) [self json:schemeTask url:url status:error ? 503 : 404 value:@{ @"error": error ? @"upstream_error" : @"not_found" }];
            return;
        }

        NSMutableDictionary *result = [@{ @"name": name, @"formula": formula, @"cas": cas } mutableCopy];
        for (NSString *key in @[@"CID", @"MolecularWeight", @"ExactMass", @"InChIKey"]) if (compound[key]) result[[key isEqualToString:@"CID"] ? @"cid" : @{ @"MolecularWeight": @"molecularWeight", @"ExactMass": @"exactMass", @"InChIKey": @"inchiKey" }[key]] = compound[key];
        if (compound[@"MolecularWeight"]) result[@"molecularWeightSource"] = @"pubchem";
        NSString *smiles = compound[@"CanonicalSMILES"] ?: compound[@"ConnectivitySMILES"];
        if (smiles) result[@"smiles"] = smiles;
        NSMutableArray *sources = [NSMutableArray arrayWithObject:[self source:@"pubchem" status:@"matched" value:compound[@"CID"] ? [NSString stringWithFormat:@"CID %@", compound[@"CID"]] : nil url:compound[@"CID"] ? [NSString stringWithFormat:@"https://pubchem.ncbi.nlm.nih.gov/compound/%@", compound[@"CID"]] : nil]];
        NSString *inchiKey = compound[@"InChIKey"];
        dispatch_group_t group = dispatch_group_create();

        if (inchiKey.length) {
            dispatch_group_enter(group);
            NSData *body = [NSJSONSerialization dataWithJSONObject:@{ @"compound": inchiKey, @"type": @"inchikey" } options:0 error:nil];
            NSURLSessionDataTask *uniTask = [self fetchJSON:@"https://www.ebi.ac.uk/unichem/api/v1/compounds" method:@"POST" headers:@{ @"Content-Type": @"application/json" } body:body completion:^(id uniPayload, NSError *uniError) {
                NSArray *mappings = [[uniPayload valueForKeyPath:@"compounds"] firstObject][@"sources"];
                NSDictionary *chebi = nil;
                NSDictionary *chembl = nil;
                for (NSDictionary *mapping in mappings) {
                    NSString *shortName = [mapping[@"shortName"] lowercaseString];
                    if ([shortName isEqualToString:@"chebi"] && !chebi) chebi = mapping;
                    if ([shortName isEqualToString:@"chembl"] && !chembl) chembl = mapping;
                }
                @synchronized (sources) {
                    [sources addObject:[self source:@"unichem" status:uniError ? @"unavailable" : (mappings.count ? @"matched" : @"not-found") value:uniError ? nil : inchiKey url:uniError ? nil : @"https://www.ebi.ac.uk/unichem/"]];
                    [sources addObject:[self source:@"chebi" status:uniError ? @"unavailable" : (chebi ? @"matched" : @"not-found") value:chebi[@"compoundId"] url:chebi[@"url"]]];
                    [sources addObject:[self source:@"chembl" status:uniError ? @"unavailable" : (chembl ? @"matched" : @"not-found") value:chembl[@"compoundId"] url:chembl[@"url"]]];
                }
                dispatch_group_leave(group);
            }];
            [self addNetworkTask:uniTask forSchemeTask:schemeTask]; [uniTask resume];
        } else {
            [sources addObjectsFromArray:@[[self source:@"unichem" status:@"not-found" value:nil url:nil], [self source:@"chebi" status:@"not-found" value:nil url:nil], [self source:@"chembl" status:@"not-found" value:nil url:nil]]];
        }

        NSString *apiKey = [self compToxAPIKey];
        if (apiKey.length) {
            dispatch_group_enter(group);
            NSString *epaURL = [NSString stringWithFormat:@"https://api-ccte.epa.gov/chemical/search/equal/%@", escaped];
            NSURLSessionDataTask *epaTask = [self fetchJSON:epaURL method:@"GET" headers:@{ @"x-api-key": apiKey } body:nil completion:^(id epaPayload, NSError *epaError) {
                NSArray *rows = [epaPayload isKindOfClass:NSArray.class] ? epaPayload : [epaPayload objectForKey:@"data"];
                NSDictionary *row = rows.firstObject;
                NSString *dtxsid = row[@"dtxsid"] ?: row[@"dtxSid"] ?: row[@"DTXSID"];
                @synchronized (sources) { [sources addObject:[self source:@"comptox" status:epaError ? @"unavailable" : (dtxsid.length ? @"matched" : @"not-found") value:dtxsid url:dtxsid.length ? [NSString stringWithFormat:@"https://comptox.epa.gov/dashboard/chemical/details/%@", dtxsid] : nil]]; }
                dispatch_group_leave(group);
            }];
            [self addNetworkTask:epaTask forSchemeTask:schemeTask]; [epaTask resume];
        } else {
            [sources addObject:[self source:@"comptox" status:@"key-required" value:nil url:nil]];
        }

        dispatch_group_notify(group, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            result[@"sources"] = sources;
            result[@"accessedAt"] = [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]];
            if ([self finishTask:schemeTask]) [self json:schemeTask url:url status:200 value:result];
        });
    }];
    [self addNetworkTask:pubchemTask forSchemeTask:schemeTask];
    [self resumePubChemTask:pubchemTask];
}

- (BOOL)isValidCompoundName:(NSString *)name {
    if (name.length < 2 || name.length > 160) return NO;
    return [name rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location == NSNotFound;
}

- (void)resolveCompoundName:(NSString *)name responseURL:(NSURL *)responseURL task:(id<WKURLSchemeTask>)schemeTask {
    NSMutableCharacterSet *allowed = [NSCharacterSet.URLPathAllowedCharacterSet mutableCopy];
    [allowed removeCharactersInString:@"/?#"];
    NSString *escaped = [name stringByAddingPercentEncodingWithAllowedCharacters:allowed];
    NSString *endpoint = [NSString stringWithFormat:@"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/%@/synonyms/JSON", escaped];
    [self beginTask:schemeTask];
    __weak typeof(self) weakSelf = self;
    NSURLSessionDataTask *resolverTask = [self fetchJSON:endpoint method:@"GET" headers:@{} body:nil completion:^(id payload, NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        if (!self) return;
        NSArray *synonyms = [[[payload valueForKeyPath:@"InformationList.Information"] firstObject] objectForKey:@"Synonym"];
        NSString *resolvedCAS = nil;
        for (NSString *candidate in synonyms) {
            if ([candidate isKindOfClass:NSString.class] && [self isValidCAS:candidate]) { resolvedCAS = candidate; break; }
        }
        BOOL active = [self finishTask:schemeTask];
        if (!active || (error && error.code == NSURLErrorCancelled)) return;
        if (error || !resolvedCAS.length) { [self json:schemeTask url:responseURL status:error ? 503 : 404 value:@{ @"error": error ? @"upstream_error" : @"not_found" }]; return; }

        NSURLComponents *components = [[NSURLComponents alloc] init];
        components.scheme = PCSSScheme;
        components.host = @"app";
        components.path = @"/api/chemistry";
        components.queryItems = @[[NSURLQueryItem queryItemWithName:@"cas" value:resolvedCAS]];
        [self lookupChemistry:components.URL task:schemeTask];
    }];
    [self addNetworkTask:resolverTask forSchemeTask:schemeTask];
    [self resumePubChemTask:resolverTask];
}

- (NSString *)compToxAPIKeyForService:(NSString *)service {
    NSDictionary *query = @{ (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword, (__bridge id)kSecAttrService: service, (__bridge id)kSecAttrAccount: @"api-key", (__bridge id)kSecReturnData: @YES, (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne };
    CFTypeRef value = NULL;
    if (SecItemCopyMatching((__bridge CFDictionaryRef)query, &value) != errSecSuccess || !value) return nil;
    NSData *data = CFBridgingRelease(value);
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

- (void)deleteCompToxAPIKeyForService:(NSString *)service {
    NSDictionary *identity = @{ (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword, (__bridge id)kSecAttrService: service, (__bridge id)kSecAttrAccount: @"api-key" };
    SecItemDelete((__bridge CFDictionaryRef)identity);
}

- (NSString *)compToxAPIKey {
    NSString *apiKey = [self compToxAPIKeyForService:PCSSCompToxKeychainService];
    if (apiKey.length) return apiKey;

    NSString *legacyAPIKey = [self compToxAPIKeyForService:PCSSLegacyCompToxKeychainService];
    if (legacyAPIKey.length && [self setCompToxAPIKey:legacyAPIKey]) {
        [self deleteCompToxAPIKeyForService:PCSSLegacyCompToxKeychainService];
    }
    return legacyAPIKey;
}

- (BOOL)setCompToxAPIKey:(NSString *)apiKey {
    NSDictionary *identity = @{ (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword, (__bridge id)kSecAttrService: PCSSCompToxKeychainService, (__bridge id)kSecAttrAccount: @"api-key" };
    SecItemDelete((__bridge CFDictionaryRef)identity);
    if (!apiKey.length) {
        [self deleteCompToxAPIKeyForService:PCSSLegacyCompToxKeychainService];
        return YES;
    }
    NSMutableDictionary *item = [identity mutableCopy];
    item[(__bridge id)kSecValueData] = [apiKey dataUsingEncoding:NSUTF8StringEncoding];
    item[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleAfterFirstUnlock;
    BOOL saved = SecItemAdd((__bridge CFDictionaryRef)item, NULL) == errSecSuccess;
    if (saved) [self deleteCompToxAPIKeyForService:PCSSLegacyCompToxKeychainService];
    return saved;
}

- (void)handleCompToxSettings:(id<WKURLSchemeTask>)schemeTask {
    NSString *method = schemeTask.request.HTTPMethod.uppercaseString ?: @"GET";
    NSURL *url = schemeTask.request.URL;
    if ([method isEqualToString:@"GET"]) { [self json:schemeTask url:url status:200 value:@{ @"supported": @YES, @"configured": @([self compToxAPIKey].length > 0) }]; return; }
    if ([method isEqualToString:@"DELETE"]) { [self setCompToxAPIKey:nil]; [self json:schemeTask url:url status:200 value:@{ @"configured": @NO }]; return; }
    if ([method isEqualToString:@"POST"] || [method isEqualToString:@"PUT"]) {
        NSDictionary *body = [NSJSONSerialization JSONObjectWithData:schemeTask.request.HTTPBody ?: [NSData data] options:0 error:nil];
        NSString *apiKey = [body[@"apiKey"] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
        if (!apiKey.length) { [self json:schemeTask url:url status:400 value:@{ @"error": @"missing_api_key" }]; return; }
        BOOL saved = [self setCompToxAPIKey:apiKey];
        [self json:schemeTask url:url status:saved ? 200 : 500 value:saved ? @{ @"configured": @YES } : @{ @"error": @"keychain_error" }];
        return;
    }
    [self json:schemeTask url:url status:405 value:@{ @"error": @"method_not_allowed" }];
}

- (BOOL)isValidCAS:(NSString *)cas {
    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"^\\d{2,7}-\\d{2}-\\d$" options:0 error:nil];
    if ([regex numberOfMatchesInString:cas options:0 range:NSMakeRange(0, cas.length)] != 1) return NO;
    NSString *digits = [cas stringByReplacingOccurrencesOfString:@"-" withString:@""];
    NSInteger checksum = 0;
    for (NSInteger index = digits.length - 2, weight = 1; index >= 0; index--, weight++) {
        checksum += ([[digits substringWithRange:NSMakeRange(index, 1)] integerValue] * weight);
    }
    return checksum % 10 == [[digits substringFromIndex:digits.length - 1] integerValue];
}

- (void)json:(id<WKURLSchemeTask>)task url:(NSURL *)url status:(NSInteger)status value:(NSDictionary *)value {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil] ?: [NSData data];
    [self respond:task url:url status:status mimeType:@"application/json" data:data];
}

- (void)respond:(id<WKURLSchemeTask>)task url:(NSURL *)url status:(NSInteger)status mimeType:(NSString *)mimeType data:(NSData *)data {
    NSString *cacheControl = [url.path hasPrefix:@"/assets/"] ? @"public, max-age=31536000, immutable" : @"no-cache";
    BOOL textual = [mimeType hasPrefix:@"text/"] || [mimeType isEqualToString:@"application/json"];
    NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc] initWithURL:url statusCode:status HTTPVersion:@"HTTP/1.1" headerFields:@{
        @"Content-Type": textual ? [NSString stringWithFormat:@"%@; charset=utf-8", mimeType] : mimeType,
        @"Cache-Control": cacheControl,
        @"X-Content-Type-Options": @"nosniff",
        @"Referrer-Policy": @"no-referrer",
    }];
    [task didReceiveResponse:response];
    [task didReceiveData:data];
    [task didFinish];
}

- (void)failTask:(id<WKURLSchemeTask>)task message:(NSString *)message {
    NSError *error = [NSError errorWithDomain:@"PCSS" code:1 userInfo:@{ NSLocalizedDescriptionKey: message }];
    [task didFailWithError:error];
}

- (NSString *)mimeTypeForExtension:(NSString *)extension {
    NSDictionary *types = @{
        @"html": @"text/html", @"css": @"text/css", @"js": @"text/javascript", @"mjs": @"text/javascript",
        @"json": @"application/json", @"svg": @"image/svg+xml", @"png": @"image/png", @"jpg": @"image/jpeg",
        @"jpeg": @"image/jpeg", @"webp": @"image/webp", @"woff": @"font/woff", @"woff2": @"font/woff2",
    };
    return types[extension.lowercaseString] ?: @"application/octet-stream";
}

@end


@interface PCSSAppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) PCSSSchemeHandler *schemeHandler;
@property(nonatomic, strong) PCSSStore *store;
@end

@implementation PCSSAppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self configureMenu];

    NSError *storeError = nil;
    self.store = [[PCSSStore alloc] initWithRootURL:PCSSStore.defaultRootURL error:&storeError];
    if (!self.store) {
        NSAlert *alert = [[NSAlert alloc] init];
        alert.messageText = @"PCSS could not open its local inventory";
        alert.informativeText = storeError.localizedDescription ?: @"Unknown storage error";
        [alert runModal];
        [NSApp terminate:nil];
        return;
    }

    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.websiteDataStore = WKWebsiteDataStore.defaultDataStore;
    NSURL *uiRoot = [NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"UI" isDirectory:YES];
    self.schemeHandler = [[PCSSSchemeHandler alloc] initWithUIRoot:uiRoot store:self.store];
    [configuration setURLSchemeHandler:self.schemeHandler forURLScheme:PCSSScheme];

    WKWebView *webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    webView.navigationDelegate = self;
    webView.allowsMagnification = YES;
    [webView setValue:@NO forKey:@"drawsBackground"];

    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 1240, 820)
                                              styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    self.window.title = @"PCSS";
    self.window.titleVisibility = NSWindowTitleVisible;
    self.window.titlebarAppearsTransparent = NO;
    self.window.movable = YES;
    self.window.minSize = NSMakeSize(760, 560);
    self.window.contentView = webView;
    [self.window center];
    [self.window setFrameAutosaveName:@"PCSSMainWindow"];
    [self.window makeKeyAndOrderFront:nil];

    [webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"pcss://app/index.html"]]];
    [NSApp activateIgnoringOtherApps:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    if ([url.scheme isEqualToString:PCSSScheme]) {
        decisionHandler(WKNavigationActionPolicyAllow);
    } else if (navigationAction.navigationType == WKNavigationTypeLinkActivated && [@[@"https", @"http"] containsObject:url.scheme.lowercaseString]) {
        [NSWorkspace.sharedWorkspace openURL:url];
        decisionHandler(WKNavigationActionPolicyCancel);
    } else {
        decisionHandler(WKNavigationActionPolicyCancel);
    }
}

- (void)configureMenu {
    NSMenu *mainMenu = [[NSMenu alloc] init];
    NSMenuItem *appMenuItem = [[NSMenuItem alloc] init];
    NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"PCSS"];
    [appMenu addItemWithTitle:@"About PCSS" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    NSString *repositoryURL = [NSBundle.mainBundle objectForInfoDictionaryKey:@"PCSSRepositoryURL"];
    if (repositoryURL.length) {
        NSMenuItem *updates = [appMenu addItemWithTitle:@"Check for Updates…" action:@selector(checkForUpdates:) keyEquivalent:@""];
        updates.target = self;
    }
    [appMenu addItem:NSMenuItem.separatorItem];
    [appMenu addItemWithTitle:@"Hide PCSS" action:@selector(hide:) keyEquivalent:@"h"];
    [appMenu addItemWithTitle:@"Quit PCSS" action:@selector(terminate:) keyEquivalent:@"q"];
    appMenuItem.submenu = appMenu;
    [mainMenu addItem:appMenuItem];

    NSMenuItem *editMenuItem = [[NSMenuItem alloc] init];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
    [editMenu addItemWithTitle:@"Undo" action:NSSelectorFromString(@"undo:") keyEquivalent:@"z"];
    [editMenu addItemWithTitle:@"Redo" action:NSSelectorFromString(@"redo:") keyEquivalent:@"Z"];
    [editMenu addItem:NSMenuItem.separatorItem];
    [editMenu addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];
    editMenuItem.submenu = editMenu;
    [mainMenu addItem:editMenuItem];
    NSApp.mainMenu = mainMenu;
}

- (void)checkForUpdates:(id)sender {
    NSString *repository = [NSBundle.mainBundle objectForInfoDictionaryKey:@"PCSSRepositoryURL"];
    NSURL *url = [NSURL URLWithString:[repository stringByAppendingString:@"/releases/latest"]];
    if (url && [url.scheme.lowercaseString isEqualToString:@"https"]) [NSWorkspace.sharedWorkspace openURL:url];
}

@end


int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = NSApplication.sharedApplication;
        PCSSAppDelegate *delegate = [[PCSSAppDelegate alloc] init];
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
