#include <stdlib.h>
#include <stdint.h>
// Returned UTF-8 JSON is malloc-owned; caller copies then frees it.
char *default_apps_query(const char *kind, const char *key, int candidates);
char *default_apps_resolve_type(const char *kind, const char *value);
char *default_apps_read_application(const char *path);
void default_apps_content_minimum(void *window, double width, double height);
char *default_apps_identify_file(const char *path);
// Inputs are borrowed only for this short call and copied into Foundation
// values. The completion block retains only the numeric ID; native copies error
// strings, Go copies them synchronously, and native frees them after callback.
void default_apps_set_file_type(uint64_t operation, const char *identifier, const char *path);
void default_apps_set_url_scheme(uint64_t operation, const char *scheme, const char *path);
