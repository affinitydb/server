/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#if !defined( _portability_h )
#define _portability_h

#if defined( __cplusplus )
extern "C" {
#endif

#ifndef MIN
#define MIN(x,y) (((x)<(y))?(x):(y))
#endif

#ifndef MAX
#define MAX(x,y) (((x)>(y))?(x):(y))
#endif

#include <signal.h>
#include <limits.h>
#include <sys/stat.h>

int fisdir( const char* path );
int ensuredir( const char* path );

enum eLogLevel { kLogDebug = 0, kLogInfo, kLogReport, kLogWarning, kLogError };
void loggingInit();
void loggingTerm();
void loggingSetFileInfo( char const * file, int line );
void logLine( enum eLogLevel level, char const * fmt, ... );
const char* ltime( void );
// Note: We could have an inlined empty version of logLine, if needed (optimal perf without any logging).

#if defined(POSIX) || defined(Darwin)
#include <stdint.h>
#include <getopt.h>
#include <sys/time.h>
#include <unistd.h>
#include <sys/socket.h>
#if defined(__linux__)
    #include <sys/sendfile.h>
    #define afy_sendfile sendfile
#elif defined(Darwin)
    #include <netinet/tcp.h>
    #include <sys/uio.h>
    ssize_t afy_sendfile( int sock, int fd, off_t* offset, size_t count );
#endif
#include <netinet/in.h>
#include <netdb.h>
#include <pthread.h>
#include <unistd.h>
#if defined(__linux__)
	typedef __sighandler_t sighandler_t;
#endif
#if defined(Darwin)
    #include <sched.h>
    #define pthread_yield sched_yield
#endif
#define closesocket(x) close(x)
#define s_errno errno
#define s_strerror(e) strerror(e)
#define PATH_SEP '/'
#define ABS_PATH(p) (p[0] == PATH_SEP)

#define attr_init __attribute__((constructor))
#define attr_fini __attribute__((destructor))

#elif defined(WIN32)
/* lots of b0rken windows stuff */

/* nb this ifndef can be removec with next store version, but for now */
/* kernel/include/affinity.h conflicts with stdint.h */
#ifndef UINT64_DEFINED
#include <stdint.h>		
#endif

#include <malloc.h>
#include <winsock2.h>
#include <windows.h>
#include <direct.h>
#include <process.h>
#include <io.h>
#include <sys/types.h>
#include "ucgetopt.h"
#include "intr.h"

	typedef void (*sighandler_t)(int);
#define PATH_SEP '\\'
#define ABS_PATH(p) (isalpha(p[0]) && p[1] == ':' && p[2] == PATH_SEP)
#define PATH_MAX MAX_PATH

#ifdef LIBRARY
#define ih(s) 1
#define id(d) 1
#else
#define ih(s) (intr_handle=(HANDLE)(s))
#define id(d) (intr_handle=(HANDLE)_get_osfhandle(d))
#endif
#define SHUT_RD 0
#define SHUT_WR 1
#define SHUT_RDWR 2
#define ssize_t int
#define S_ISDIR(m) ((m) & S_IFDIR)
#define read(f,b,l) (id(f),(ssize_t)read((f),(b),(int)(l)))
#define write(f,b,l) (id(f),(ssize_t)write((f),(b),(int)(l)))
#define recv(s,b,l,f) (ih(s),(ssize_t)recv((SOCKET)(s),(b),(int)(l),(f)))
#define send(s,b,l,f) (ih(s),(ssize_t)send((SOCKET)(s),(b),(int)(l),(f)))
#define socket(a,b,f) (int)socket((a),(b),(f))
#define connect(s,a,l) (ih(s),connect((SOCKET)(s),(a),(l)))
#define closesocket(s) (ih(s),closesocket(s))
#define setsockopt(s,a,b,o,l) setsockopt((SOCKET)(s),(a),(b),(o),(l))
#define bind(s,a,l)  bind((SOCKET)(s),(a),(l))
#define accept(s,a,l) (ih(s),(int)accept((SOCKET)(s),(a),(l)))
#define listen(s,n) listen((SOCKET)(s),(n))
#define snprintf _snprintf
#define chdir(dir) _chdir(dir)
#define open(fd,flag) _open((fd),(flag)|O_BINARY)
#define close(fd) _close(fd)
#define unlink(p) _unlink(p)
#define s_errno WSAGetLastError()
#define strncasecmp(a,b,n) _strnicmp((a),(b),(n))
#define strcasecmp(a,b) _stricmp((a),(b))
#define usleep(u) Sleep(u)
#define SIGUSR1 0

#define attr_init 
#define attr_fini 

#if _MSC_VER <= 1400
#define pthread_t unsigned long
#else
#define pthread_t uintptr_t
#endif

#define pthread_mutex_t HANDLE

    typedef struct pthread_attr_s { int foo; /* dummy */ } pthread_attr_t;

#define pthread_self() ((pthread_t)GetCurrentThreadId())
    int pthread_create( pthread_t* t, const pthread_attr_t* attr, 
                        void* (*start)(void*), void* arg );
    int pthread_detach( pthread_t* t );
    int pthread_kill( pthread_t th, int sig );
#define pthread_cancel(th) TerminateThread((HANDLE)th,0)

#define pthread_mutex_init( m, n ) *(m) = CreateMutex( NULL, 0, NULL )
#define pthread_mutex_destroy( m ) CloseHandle( *(m) )
#define pthread_mutex_lock( m ) WaitForSingleObject( *(m), INFINITE )
#define pthread_mutex_unlock( m ) ReleaseMutex( *(m) )
    ssize_t sendfile( int sock, int fd, off_t* offset, size_t count );
    #define afy_sendfile sendfile
    char *strsep(char **stringp, const char *delim);
    const char* s_strerror( int errn );

#ifdef LIBRARY
#define export __declspec(dllexport)
#endif
#endif

#if defined( __cplusplus )
}
#endif

#define LOG_LINE loggingSetFileInfo(__FILE__, __LINE__), logLine

#endif
