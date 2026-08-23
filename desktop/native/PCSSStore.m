#import "PCSSStore.h"
#import <sqlite3.h>

static NSString *const PCSSErrorDomain = @"PCSSStore";
static const NSInteger PCSSSchemaVersion = 1;

@interface PCSSStore ()
@property(nonatomic) sqlite3 *database;
@property(nonatomic, readwrite) NSURL *rootURL;
@property(nonatomic, readwrite) NSURL *structureCacheURL;
@property(nonatomic, strong) NSURL *backupsURL;
@end

@implementation PCSSStore

+ (NSURL *)defaultRootURL {
    NSURL *base = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject;
    return [base URLByAppendingPathComponent:@"PCSS" isDirectory:YES];
}

- (instancetype)initWithRootURL:(NSURL *)rootURL error:(NSError **)error {
    self = [super init];
    if (!self) return nil;
    _rootURL = rootURL;
    _structureCacheURL = [rootURL URLByAppendingPathComponent:@"StructureCache" isDirectory:YES];
    _backupsURL = [rootURL URLByAppendingPathComponent:@"Backups" isDirectory:YES];
    NSFileManager *files = NSFileManager.defaultManager;
    for (NSURL *directory in @[_rootURL, _structureCacheURL, _backupsURL]) {
        if (![files createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:error]) return nil;
    }
    NSURL *databaseURL = [rootURL URLByAppendingPathComponent:@"inventory.sqlite3"];
    if (sqlite3_open_v2(databaseURL.fileSystemRepresentation, &_database, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, NULL) != SQLITE_OK) {
        if (error) *error = [self sqliteError:@"Could not open inventory database"];
        return nil;
    }
    sqlite3_busy_timeout(_database, 5000);
    if (![self execute:@"PRAGMA journal_mode=WAL" error:error] ||
        ![self execute:@"PRAGMA synchronous=FULL" error:error] ||
        ![self execute:@"CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)" error:error] ||
        ![self execute:@"CREATE TABLE IF NOT EXISTS chemicals (id TEXT PRIMARY KEY, name TEXT NOT NULL, formula TEXT NOT NULL, cas TEXT NOT NULL, location TEXT NOT NULL, amount TEXT NOT NULL, tags_json TEXT NOT NULL, created_at TEXT NOT NULL, structure_url TEXT NOT NULL, structure_status TEXT, database_json TEXT)" error:error] ||
        ![self execute:@"CREATE INDEX IF NOT EXISTS chemicals_cas_idx ON chemicals(cas)" error:error] ||
        ![self execute:@"CREATE INDEX IF NOT EXISTS chemicals_created_idx ON chemicals(created_at DESC)" error:error]) return nil;
    NSString *versionSQL = [NSString stringWithFormat:@"INSERT OR REPLACE INTO metadata(key,value) VALUES('schema_version','%ld')", (long)PCSSSchemaVersion];
    if (![self execute:versionSQL error:error]) return nil;
    return self;
}

- (void)dealloc {
    if (_database) sqlite3_close(_database);
}

- (NSError *)sqliteError:(NSString *)message {
    NSString *detail = _database ? [NSString stringWithUTF8String:sqlite3_errmsg(_database)] : @"Unknown SQLite error";
    return [NSError errorWithDomain:PCSSErrorDomain code:1 userInfo:@{NSLocalizedDescriptionKey: message, NSUnderlyingErrorKey: [NSError errorWithDomain:PCSSErrorDomain code:2 userInfo:@{NSLocalizedDescriptionKey: detail}]}];
}

- (BOOL)execute:(NSString *)sql error:(NSError **)error {
    char *message = NULL;
    int result = sqlite3_exec(self.database, sql.UTF8String, NULL, NULL, &message);
    if (result == SQLITE_OK) return YES;
    if (error) {
        NSString *detail = message ? [NSString stringWithUTF8String:message] : @"Unknown SQLite error";
        *error = [NSError errorWithDomain:PCSSErrorDomain code:result userInfo:@{NSLocalizedDescriptionKey: detail}];
    }
    sqlite3_free(message);
    return NO;
}

- (NSString *)stringColumn:(sqlite3_stmt *)statement index:(int)index {
    const unsigned char *value = sqlite3_column_text(statement, index);
    return value ? [NSString stringWithUTF8String:(const char *)value] : @"";
}

- (NSString *)JSONString:(id)value fallback:(NSString *)fallback {
    if (!value || value == NSNull.null || ![NSJSONSerialization isValidJSONObject:value]) return fallback;
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : fallback;
}

- (id)JSONObject:(NSString *)value fallback:(id)fallback {
    if (!value.length) return fallback;
    id result = [NSJSONSerialization JSONObjectWithData:[value dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
    return result ?: fallback;
}

- (NSArray<NSDictionary *> *)allChemicals:(NSError **)error {
    @synchronized (self) {
        sqlite3_stmt *statement = NULL;
        const char *sql = "SELECT id,name,formula,cas,location,amount,tags_json,created_at,structure_url,structure_status,database_json FROM chemicals ORDER BY created_at DESC";
        if (sqlite3_prepare_v2(self.database, sql, -1, &statement, NULL) != SQLITE_OK) {
            if (error) *error = [self sqliteError:@"Could not read inventory"];
            return nil;
        }
        NSMutableArray *chemicals = [NSMutableArray array];
        while (sqlite3_step(statement) == SQLITE_ROW) {
            NSMutableDictionary *chemical = [@{
                @"id": [self stringColumn:statement index:0], @"name": [self stringColumn:statement index:1],
                @"formula": [self stringColumn:statement index:2], @"cas": [self stringColumn:statement index:3],
                @"location": [self stringColumn:statement index:4], @"amount": [self stringColumn:statement index:5],
                @"tags": [self JSONObject:[self stringColumn:statement index:6] fallback:@[]],
                @"createdAt": [self stringColumn:statement index:7], @"structureUrl": [self stringColumn:statement index:8]
            } mutableCopy];
            NSString *structureStatus = [self stringColumn:statement index:9];
            NSString *databaseJSON = [self stringColumn:statement index:10];
            if (structureStatus.length) chemical[@"structureStatus"] = structureStatus;
            if (databaseJSON.length) chemical[@"database"] = [self JSONObject:databaseJSON fallback:@{}];
            [chemicals addObject:chemical];
        }
        sqlite3_finalize(statement);
        return chemicals;
    }
}

- (BOOL)isInventoryInitialized {
    @synchronized (self) {
        sqlite3_stmt *statement = NULL;
        BOOL initialized = NO;
        if (sqlite3_prepare_v2(self.database, "SELECT value FROM metadata WHERE key='inventory_initialized'", -1, &statement, NULL) == SQLITE_OK) initialized = sqlite3_step(statement) == SQLITE_ROW;
        if (statement) sqlite3_finalize(statement);
        return initialized;
    }
}

- (BOOL)validateChemical:(id)value error:(NSError **)error {
    NSDictionary *chemical = [value isKindOfClass:NSDictionary.class] ? value : nil;
    if (!chemical) goto invalid;
    for (NSString *key in @[@"id", @"name", @"formula", @"cas", @"location", @"createdAt", @"structureUrl"]) {
        if (![chemical[key] isKindOfClass:NSString.class] || ![chemical[key] length]) goto invalid;
    }
    if (chemical[@"amount"] && ![chemical[@"amount"] isKindOfClass:NSString.class]) goto invalid;
    if (![chemical[@"tags"] isKindOfClass:NSArray.class]) goto invalid;
    for (id tag in chemical[@"tags"]) if (![tag isKindOfClass:NSString.class]) goto invalid;
    if (chemical[@"database"] && ![chemical[@"database"] isKindOfClass:NSDictionary.class]) goto invalid;
    if (chemical[@"structureStatus"] && ![chemical[@"structureStatus"] isEqual:@"not-found"]) goto invalid;
    return YES;
invalid:
    if (error) *error = [NSError errorWithDomain:PCSSErrorDomain code:3 userInfo:@{NSLocalizedDescriptionKey: @"The inventory contains an invalid chemical record."}];
    return NO;
}

- (BOOL)replaceChemicals:(NSArray *)chemicals createBackup:(BOOL)createBackup error:(NSError **)error {
    if (![chemicals isKindOfClass:NSArray.class]) {
        if (error) *error = [NSError errorWithDomain:PCSSErrorDomain code:3 userInfo:@{NSLocalizedDescriptionKey: @"Inventory must be an array."}];
        return NO;
    }
    NSMutableSet *ids = [NSMutableSet set];
    for (NSDictionary *chemical in chemicals) {
        if (![self validateChemical:chemical error:error]) return NO;
        if ([ids containsObject:chemical[@"id"]]) {
            if (error) *error = [NSError errorWithDomain:PCSSErrorDomain code:4 userInfo:@{NSLocalizedDescriptionKey: @"Duplicate record IDs are not allowed."}];
            return NO;
        }
        [ids addObject:chemical[@"id"]];
    }
    @synchronized (self) {
        if (createBackup && ![self createBackup:error]) return NO;
        if (![self execute:@"BEGIN IMMEDIATE TRANSACTION" error:error]) return NO;
        BOOL success = [self execute:@"DELETE FROM chemicals" error:error];
        sqlite3_stmt *statement = NULL;
        const char *sql = "INSERT INTO chemicals(id,name,formula,cas,location,amount,tags_json,created_at,structure_url,structure_status,database_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)";
        if (success && sqlite3_prepare_v2(self.database, sql, -1, &statement, NULL) != SQLITE_OK) {
            success = NO;
            if (error) *error = [self sqliteError:@"Could not prepare inventory write"];
        }
        for (NSDictionary *chemical in chemicals) {
            if (!success) break;
            NSArray *values = @[
                chemical[@"id"], chemical[@"name"], chemical[@"formula"], chemical[@"cas"], chemical[@"location"], chemical[@"amount"] ?: @"",
                [self JSONString:chemical[@"tags"] fallback:@"[]"], chemical[@"createdAt"], chemical[@"structureUrl"], chemical[@"structureStatus"] ?: NSNull.null,
                chemical[@"database"] ? [self JSONString:chemical[@"database"] fallback:@"{}"] : NSNull.null
            ];
            for (int index = 0; index < values.count; index++) {
                id item = values[index];
                if (item == NSNull.null) sqlite3_bind_null(statement, index + 1);
                else sqlite3_bind_text(statement, index + 1, [item UTF8String], -1, SQLITE_TRANSIENT);
            }
            success = sqlite3_step(statement) == SQLITE_DONE;
            if (!success && error) *error = [self sqliteError:@"Could not save inventory record"];
            sqlite3_reset(statement);
            sqlite3_clear_bindings(statement);
        }
        if (statement) sqlite3_finalize(statement);
        if (success) success = [self execute:@"INSERT OR REPLACE INTO metadata(key,value) VALUES('inventory_initialized','1')" error:error];
        if (success) {
            success = [self execute:@"COMMIT" error:error];
            if (!success) [self execute:@"ROLLBACK" error:nil];
        } else [self execute:@"ROLLBACK" error:nil];
        return success;
    }
}

- (BOOL)createBackup:(NSError **)error {
    NSArray *existing = [self allChemicals:error];
    if (!existing || existing.count == 0) return existing != nil;
    NSDictionary *document = @{ @"schemaVersion": @(PCSSSchemaVersion), @"exportedAt": [[NSISO8601DateFormatter new] stringFromDate:NSDate.date], @"chemicals": existing };
    NSData *data = [NSJSONSerialization dataWithJSONObject:document options:NSJSONWritingPrettyPrinted | NSJSONWritingSortedKeys error:error];
    if (!data) return NO;
    NSString *filename = [NSString stringWithFormat:@"inventory-%lld-%@.json", (long long)(NSDate.date.timeIntervalSince1970 * 1000), NSUUID.UUID.UUIDString];
    if (![data writeToURL:[self.backupsURL URLByAppendingPathComponent:filename] options:NSDataWritingAtomic error:error]) return NO;
    NSArray<NSURL *> *files = [NSFileManager.defaultManager contentsOfDirectoryAtURL:self.backupsURL includingPropertiesForKeys:@[NSURLContentModificationDateKey] options:0 error:nil];
    files = [files sortedArrayUsingComparator:^NSComparisonResult(NSURL *left, NSURL *right) { return [left.lastPathComponent compare:right.lastPathComponent]; }];
    while (files.count > 20) {
        [NSFileManager.defaultManager removeItemAtURL:files.firstObject error:nil];
        files = [files subarrayWithRange:NSMakeRange(1, files.count - 1)];
    }
    return YES;
}

- (NSString *)CSVField:(id)value {
    NSString *text = [value isKindOfClass:NSString.class] ? value : @"";
    return [NSString stringWithFormat:@"\"%@\"", [text stringByReplacingOccurrencesOfString:@"\"" withString:@"\"\""]];
}

- (NSData *)exportDataForFormat:(NSString *)format error:(NSError **)error {
    NSArray *chemicals = [self allChemicals:error];
    if (!chemicals) return nil;
    if ([format.lowercaseString isEqualToString:@"json"]) {
        NSDictionary *document = @{ @"schemaVersion": @(PCSSSchemaVersion), @"exportedAt": [[NSISO8601DateFormatter new] stringFromDate:NSDate.date], @"chemicals": chemicals };
        return [NSJSONSerialization dataWithJSONObject:document options:NSJSONWritingPrettyPrinted | NSJSONWritingSortedKeys error:error];
    }
    if (![format.lowercaseString isEqualToString:@"csv"]) {
        if (error) *error = [NSError errorWithDomain:PCSSErrorDomain code:5 userInfo:@{NSLocalizedDescriptionKey: @"Unsupported export format."}];
        return nil;
    }
    NSMutableArray *rows = [NSMutableArray arrayWithObject:@"id,name,formula,cas,location,amount,tags,createdAt,structureUrl,structureStatus,database"];
    for (NSDictionary *chemical in chemicals) {
        NSArray *fields = @[
            chemical[@"id"], chemical[@"name"], chemical[@"formula"], chemical[@"cas"], chemical[@"location"], chemical[@"amount"] ?: @"",
            [self JSONString:chemical[@"tags"] fallback:@"[]"], chemical[@"createdAt"], chemical[@"structureUrl"], chemical[@"structureStatus"] ?: @"",
            chemical[@"database"] ? [self JSONString:chemical[@"database"] fallback:@"{}"] : @""
        ];
        NSMutableArray *encoded = [NSMutableArray array];
        for (id field in fields) [encoded addObject:[self CSVField:field]];
        [rows addObject:[encoded componentsJoinedByString:@","]];
    }
    return [[rows componentsJoinedByString:@"\r\n"] dataUsingEncoding:NSUTF8StringEncoding];
}

- (NSArray<NSArray<NSString *> *> *)parseCSV:(NSString *)text error:(NSError **)error {
    NSMutableArray *rows = [NSMutableArray array], *row = [NSMutableArray array];
    NSMutableString *field = [NSMutableString string];
    BOOL quoted = NO;
    for (NSUInteger index = 0; index < text.length; index++) {
        unichar character = [text characterAtIndex:index];
        if (quoted) {
            if (character == '"') {
                if (index + 1 < text.length && [text characterAtIndex:index + 1] == '"') { [field appendString:@"\""]; index++; }
                else quoted = NO;
            } else [field appendFormat:@"%C", character];
        } else if (character == '"' && field.length == 0) quoted = YES;
        else if (character == ',') { [row addObject:[field copy]]; [field setString:@""]; }
        else if (character == '\n' || character == '\r') {
            if (character == '\r' && index + 1 < text.length && [text characterAtIndex:index + 1] == '\n') index++;
            [row addObject:[field copy]]; [field setString:@""];
            if (row.count > 1 || [row.firstObject length]) [rows addObject:[row copy]];
            [row removeAllObjects];
        } else [field appendFormat:@"%C", character];
    }
    if (quoted) {
        if (error) *error = [NSError errorWithDomain:PCSSErrorDomain code:6 userInfo:@{NSLocalizedDescriptionKey: @"CSV contains an unterminated quoted field."}];
        return nil;
    }
    if (field.length || row.count) { [row addObject:[field copy]]; [rows addObject:[row copy]]; }
    return rows;
}

- (NSArray<NSDictionary *> *)chemicalsFromImportData:(NSData *)data format:(NSString *)format error:(NSError **)error {
    NSArray *chemicals = nil;
    if ([format.lowercaseString isEqualToString:@"json"]) {
        id document = [NSJSONSerialization JSONObjectWithData:data options:0 error:error];
        if ([document isKindOfClass:NSArray.class]) chemicals = document;
        else if ([document isKindOfClass:NSDictionary.class] && [document[@"chemicals"] isKindOfClass:NSArray.class]) {
            NSInteger version = [document[@"schemaVersion"] integerValue];
            if (version > PCSSSchemaVersion) {
                if (error) *error = [NSError errorWithDomain:PCSSErrorDomain code:8 userInfo:@{NSLocalizedDescriptionKey: @"This inventory was created by a newer version of PCSS."}];
                return nil;
            }
            chemicals = document[@"chemicals"];
        }
    } else if ([format.lowercaseString isEqualToString:@"csv"]) {
        NSString *text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        NSArray<NSArray<NSString *> *> *rows = text ? [self parseCSV:text error:error] : nil;
        NSArray *expected = @[@"id",@"name",@"formula",@"cas",@"location",@"amount",@"tags",@"createdAt",@"structureUrl",@"structureStatus",@"database"];
        if (rows.count && [rows.firstObject isEqual:expected]) {
            NSMutableArray *parsed = [NSMutableArray array];
            for (NSUInteger rowIndex = 1; rowIndex < rows.count; rowIndex++) {
                NSArray *row = rows[rowIndex];
                if (row.count != expected.count) { chemicals = nil; break; }
                NSMutableDictionary *chemical = [NSMutableDictionary dictionary];
                for (NSUInteger column = 0; column < expected.count; column++) chemical[expected[column]] = row[column];
                chemical[@"tags"] = [self JSONObject:chemical[@"tags"] fallback:nil];
                if (![chemical[@"structureStatus"] length]) [chemical removeObjectForKey:@"structureStatus"];
                if ([chemical[@"database"] length]) chemical[@"database"] = [self JSONObject:chemical[@"database"] fallback:nil];
                else [chemical removeObjectForKey:@"database"];
                [parsed addObject:chemical];
            }
            if (parsed.count == MAX((NSInteger)rows.count - 1, 0)) chemicals = parsed;
        }
    }
    if (![chemicals isKindOfClass:NSArray.class]) {
        if (error && !*error) *error = [NSError errorWithDomain:PCSSErrorDomain code:7 userInfo:@{NSLocalizedDescriptionKey: @"The selected file is not a valid PCSS inventory export."}];
        return nil;
    }
    NSMutableSet *ids = [NSMutableSet set];
    for (NSDictionary *chemical in chemicals) {
        if (![self validateChemical:chemical error:error] || [ids containsObject:chemical[@"id"]]) {
            if (error && !*error) *error = [NSError errorWithDomain:PCSSErrorDomain code:4 userInfo:@{NSLocalizedDescriptionKey: @"The import contains duplicate record IDs."}];
            return nil;
        }
        [ids addObject:chemical[@"id"]];
    }
    return chemicals;
}

- (NSURL *)structureURLForCAS:(NSString *)cas {
    NSString *safe = [[cas componentsSeparatedByCharactersInSet:[[NSCharacterSet characterSetWithCharactersInString:@"0123456789-"] invertedSet]] componentsJoinedByString:@""];
    return [self.structureCacheURL URLByAppendingPathComponent:[safe stringByAppendingPathExtension:@"png"]];
}

- (NSData *)cachedStructureForCAS:(NSString *)cas {
    return [NSData dataWithContentsOfURL:[self structureURLForCAS:cas]];
}

- (BOOL)cacheStructureData:(NSData *)data forCAS:(NSString *)cas error:(NSError **)error {
    return [data writeToURL:[self structureURLForCAS:cas] options:NSDataWritingAtomic error:error];
}

@end
