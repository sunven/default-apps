#include <stdlib.h>
// Returned UTF-8 JSON is malloc-owned; caller copies then frees it.
char *default_apps_query(const char *kind, const char *key, int candidates);
char *default_apps_resolve_extension(const char *extension);
void default_apps_content_minimum(void *window, double width, double height);
