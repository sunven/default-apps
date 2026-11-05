#include <stdint.h>
char *probe_query(const char *kind, const char *key);
void probe_submit(uint64_t operation, const char *kind, const char *key, const char *path);
void probe_delayed(uint64_t operation, int milliseconds);
int probe_main_thread(void);

