#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface PCSSStore : NSObject

@property(nonatomic, readonly) NSURL *rootURL;
@property(nonatomic, readonly) NSURL *structureCacheURL;

+ (NSURL *)defaultRootURL;
- (nullable instancetype)initWithRootURL:(NSURL *)rootURL error:(NSError **)error;
- (nullable NSArray<NSDictionary *> *)allChemicals:(NSError **)error;
- (BOOL)isInventoryInitialized;
- (BOOL)replaceChemicals:(NSArray *)chemicals createBackup:(BOOL)createBackup error:(NSError **)error;
- (nullable NSData *)exportDataForFormat:(NSString *)format error:(NSError **)error;
- (nullable NSArray<NSDictionary *> *)chemicalsFromImportData:(NSData *)data format:(NSString *)format error:(NSError **)error;
- (nullable NSData *)cachedStructureForCAS:(NSString *)cas;
- (BOOL)cacheStructureData:(NSData *)data forCAS:(NSString *)cas error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
