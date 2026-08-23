#import <Foundation/Foundation.h>
#import "PCSSStore.h"

static void Require(BOOL condition, NSString *message) {
    if (condition) return;
    NSLog(@"PCSSStore test failed: %@", message);
    exit(1);
}

int main(void) {
    @autoreleasepool {
        NSURL *root = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:[@"PCSSStoreTests-" stringByAppendingString:NSUUID.UUID.UUIDString]] isDirectory:YES];
        NSError *error = nil;
        PCSSStore *store = [[PCSSStore alloc] initWithRootURL:root error:&error];
        Require(store != nil, error.localizedDescription);
        Require(!store.isInventoryInitialized, @"New inventory should not be initialized");

        NSDictionary *chemical = @{
            @"id": @"test-1", @"name": @"Benzoic acid", @"formula": @"C7H6O2", @"cas": @"65-85-0",
            @"location": @"Cabinet A2", @"amount": @"250 g", @"tags": @[@"Organic acid"],
            @"createdAt": @"2026-08-23T00:00:00Z", @"structureUrl": @"/api/structure?cas=65-85-0",
            @"database": @{ @"name": @"Benzoic acid", @"formula": @"C7H6O2", @"cas": @"65-85-0", @"sources": @[], @"accessedAt": @"2026-08-23T00:00:00Z" }
        };
        Require([store replaceChemicals:@[chemical] createBackup:NO error:&error], error.localizedDescription);
        Require(store.isInventoryInitialized, @"Saved inventory was not marked initialized");
        NSArray *loaded = [store allChemicals:&error];
        Require(loaded.count == 1 && [loaded.firstObject[@"database"] isKindOfClass:NSDictionary.class], @"SQLite round trip lost data");

        for (NSString *format in @[@"json", @"csv"]) {
            NSData *exported = [store exportDataForFormat:format error:&error];
            Require(exported.length > 0, [NSString stringWithFormat:@"%@ export failed", format]);
            NSArray *imported = [store chemicalsFromImportData:exported format:format error:&error];
            Require(imported.count == 1 && [imported.firstObject[@"cas"] isEqual:@"65-85-0"], [NSString stringWithFormat:@"%@ import round trip failed", format]);
        }
        NSData *futureJSON = [NSJSONSerialization dataWithJSONObject:@{ @"schemaVersion": @999, @"chemicals": @[chemical] } options:0 error:nil];
        Require([store chemicalsFromImportData:futureJSON format:@"json" error:&error] == nil, @"A future schema version was accepted");
        NSData *malformedCSV = [@"id,name\n\"unterminated" dataUsingEncoding:NSUTF8StringEncoding];
        Require([store chemicalsFromImportData:malformedCSV format:@"csv" error:&error] == nil, @"Malformed CSV was accepted");

        NSData *image = [@"fake-png" dataUsingEncoding:NSUTF8StringEncoding];
        Require([store cacheStructureData:image forCAS:@"65-85-0" error:&error], @"Structure cache write failed");
        Require([[store cachedStructureForCAS:@"65-85-0"] isEqual:image], @"Structure cache read failed");

        NSMutableDictionary *changed = [chemical mutableCopy];
        changed[@"amount"] = @"200 g";
        Require([store replaceChemicals:@[changed] createBackup:YES error:&error], error.localizedDescription);
        NSArray *backups = [NSFileManager.defaultManager contentsOfDirectoryAtURL:[root URLByAppendingPathComponent:@"Backups"] includingPropertiesForKeys:nil options:0 error:&error];
        Require(backups.count == 1, @"Automatic backup was not created");

        NSDictionary *invalid = @{ @"id": @"invalid" };
        Require(![store replaceChemicals:@[invalid] createBackup:YES error:&error], @"Invalid inventory was accepted");
        loaded = [store allChemicals:&error];
        Require(loaded.count == 1 && [loaded.firstObject[@"amount"] isEqual:@"200 g"], @"Failed transaction damaged existing inventory");

        for (NSInteger index = 0; index < 25; index++) Require([store replaceChemicals:@[changed] createBackup:YES error:&error], @"Backup rotation write failed");
        backups = [NSFileManager.defaultManager contentsOfDirectoryAtURL:[root URLByAppendingPathComponent:@"Backups"] includingPropertiesForKeys:nil options:0 error:&error];
        Require(backups.count == 20, @"Backup rotation did not retain exactly 20 snapshots");

        Require([store replaceChemicals:@[] createBackup:YES error:&error], @"Empty inventory could not be saved");
        Require(store.isInventoryInitialized && [store allChemicals:&error].count == 0, @"Initialized empty inventory was not preserved");
        PCSSStore *reopened = [[PCSSStore alloc] initWithRootURL:root error:&error];
        Require(reopened.isInventoryInitialized && [reopened allChemicals:&error].count == 0, @"Empty inventory did not survive database reopen");

        [NSFileManager.defaultManager removeItemAtURL:root error:nil];
        NSLog(@"PCSSStore tests passed");
    }
    return 0;
}
