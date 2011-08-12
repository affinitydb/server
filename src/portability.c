/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#include "portability.h"
#include "intr.h"

int fisdir( const char* path ) {
    struct stat stats;

    if ( stat( path, &stats ) != 0 ) { 
        return 0;
    }
    return S_ISDIR( stats.st_mode );
}

#if defined( WIN32 )

#define SF_BUF_SIZE 16384

ssize_t sendfile( int sock, int fd, off_t* offset, size_t count ) {
    char buf[SF_BUF_SIZE];
    off_t start;
    size_t wrote = 0, left = 0, got, sent = 0, totsent = 0;
    ssize_t res = 0;

    if (offset) { 
	start = lseek( fd, 0, SEEK_CUR ); 
	if ( start < 0 ) { return -1; } 
	res = lseek( fd, *offset, SEEK_SET );
	if ( res < 0 ) { return -1; }
    }

    for ( wrote= 0, left = count; wrote < count; wrote += totsent, left -= totsent ) {
	res = read( fd, buf, MIN( left, SF_BUF_SIZE ) );
	if ( res < 0 ) { goto leave; }
	if ( res == 0 ) { res = (ssize_t)wrote; goto leave; }
	got = res;
	
	for ( totsent = 0, sent = 0; totsent < got; totsent += sent ) {
	    res = send( sock, buf+totsent, got-totsent, 0 );
		if ( res < 0 ) { goto leave; }
	    sent = res;
	}
    }
    res = (ssize_t)wrote;
leave:
    if (offset) {
	lseek( fd, start, SEEK_SET );
	*offset += (off_t)wrote;
    }
    return res;
}
#endif

#ifdef WIN32
int pthread_create( pthread_t* t, const pthread_attr_t* attr, 
		    void* (*start)(void*), void* arg ) {
    pthread_t res;
    if ( !t ) { return -1; }
    if ( attr ) { return -1; } /* we dont know how to handle attribs for now */
    res = _beginthread( (void (*)(void*))start, 0, arg );
    if ( res == (pthread_t)-1 ) { return -1; }
    *t = res;
    return 0;
}
int pthread_detach( pthread_t* t ) {
    _endthread();
    return 0;
}
#endif

#ifdef WIN32
#ifdef LIBRARY
int pthread_kill( pthread_t th, int sig ) { return 0; }
#else
void CALLBACK intr_async( ULONG_PTR sig ) {
    CancelIo( intr_handle );    /* interrupt system calls */
    if ( (uint32_t)sig == intr_sig ) { intr_handler( (uint32_t)sig ); }
}

int pthread_kill( pthread_t th, int sig ) {
    QueueUserAPC( intr_async, (HANDLE)th, sig );
	return 1;
}
#endif
#endif

#ifdef WIN32
const char* s_strerror( int errn ) {
	static char errmsg[512];
	size_t len;
	errmsg[0]='\0';
	if ( !FormatMessage( FORMAT_MESSAGE_FROM_SYSTEM, 0, errn, 
		0, errmsg, 511, NULL ) ) {
		return s_strerror(s_errno);
	}
	len = strlen( errmsg );
	while ( len > 0 && strchr( "\r\n", errmsg[len-1] ) ) {
		errmsg[len-1] = '\0'; len--;
	}
	return errmsg;
}
#endif

#ifdef WIN32
char *strsep(char **stringp, const char *delim) {
    char* string = NULL, *tmp = NULL;
    if ( stringp == NULL || *stringp == NULL ) { return NULL; }
    string = *stringp;
    
    tmp = strpbrk( string, delim );
    if ( tmp == NULL ) { *stringp = NULL; return string; }
    *tmp = '\0';
    *stringp = tmp+1;
    return string;
}
#endif

#ifdef DYNAMIC_LIBRARY
BOOL WINAPI DllMain( HINSTANCE dll, DWORD reason, LPVOID reserved ) {
    if ( reason == DLL_PROCESS_ATTACH ) { dl_init(); }
    else if ( reason == DLL_PROCESS_DETACH ) { dl_fini(); }
    else if ( reason == DLL_THREAD_ATTACH ) { pt_init(); }
    else if ( reason == DLL_THREAD_DETACH ) { pt_fini(); }
    else { }                    /* ignore */ 
    return 1;
}
#endif

#ifdef STRSEP_MAIN
int main( int argc, char* argv[] ) {
    char* test[] = {
        strdup( "" ),
	strdup( "hello" ),
	strdup( "hello world" ),
	strdup( "hello  world" ),
	strdup( "hello world\tthree" ),
    };
    const int len = sizeof( test ) / sizeof( char* );
    char* mytest[len], **ptr = NULL, **myptr = NULL;
    char* res = NULL, *myres = NULL, *sep = " ";
    int i;

    for ( i = 0; i < len; i++ ) {
	mytest[i] = strdup( test[i] );
    }

    for ( i = 0; i < len; i++ ) {
        if ( i == 2 ) { sep = "\t "; }
        ptr = &test[i];
        do {
            printf( "strsep( ptr = &\"%s\", \"%s\" )", *ptr, sep );
            res = strsep( ptr, sep );
            printf( " = \"%s\", ptr = \"%s\"\n", res, *ptr );
            printf( "-------------\n" );
        } while ( *ptr );

        myptr = &mytest[i];
        do { 
            printf( "mystrsep( myptr = &\"%s\", \"%s\" )", *myptr, sep );
            myres = mystrsep( myptr, sep );
            printf( " = \"%s\", myptr = \"%s\"\n", myres, *myptr );
            printf( "-------------\n" );            
        } while ( *myptr );
        printf( "--------------------------\n" );
    }
}
#endif
