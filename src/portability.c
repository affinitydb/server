/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */
/*
Copyright (c) 2004-2013 GoPivotal, Inc. All Rights Reserved.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,  WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations
under the License.
*/

#include "portability.h"
#include "intr.h"
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <string.h>
#include <time.h>

int fisdir( const char* path ) {
    struct stat stats;

    if ( stat( path, &stats ) != 0 ) { 
        return 0;
    }
    return S_ISDIR( stats.st_mode );
}

int ensuredir( const char* path ) {
    struct stat stats;
    if ( stat( path, &stats ) == 0 ) {
        return fisdir( path );
    }
    #ifdef WIN32
        return CreateDirectory( path, NULL ) ? 1 : 0;
    #else
        return ( 0 == mkdir( path, 0777 ) ) ? 1 : 0;
    #endif
}

static enum eLogLevel const gMinLoggingLevel = kLogReport; // Note: Change this value to get more or less logs...
static char const* const gLoggingLevels[] = {"DEBUG", "INFO", "REPORT", "WARNING", "ERROR"};

#ifdef WIN32
DWORD gLoggingTls;
void loggingInit() { gLoggingTls = TlsAlloc(); }
void loggingTerm() { TlsFree( gLoggingTls ); }
void* loggingTlsGet() { return TlsGetValue( gLoggingTls ); }
void loggingTlsSet(void* p) { TlsSetValue( gLoggingTls, p ); }
#else
pthread_key_t gLoggingTls;
void loggingInit() { pthread_key_create( &gLoggingTls, NULL ); }
void loggingTerm() { pthread_key_delete( gLoggingTls ); }
void* loggingTlsGet() { return pthread_getspecific( gLoggingTls ); }
void loggingTlsSet(void* p) { pthread_setspecific( gLoggingTls, p ); }
#endif
typedef struct logginginfo_s { char const * file; int line; } logginginfo_t;

void loggingSetFileInfo( char const * file, int line ) {
    logginginfo_t* lInfo;
    void* lOld = loggingTlsGet();
    if ( !lOld ) { lOld = malloc(sizeof(logginginfo_t)); loggingTlsSet(lOld); }
    lInfo = (logginginfo_t*)lOld;
    lInfo->file = file;
    lInfo->line = line;
}

void logLine( enum eLogLevel level, char const * fmt, ... ) {
    logginginfo_t* lLoggingTls;
    char const* lShortFile;
    char lBuf[ 0x1000 ];
    va_list lArguments;
    if ( level < gMinLoggingLevel ) return;
    lLoggingTls = ( logginginfo_t* )loggingTlsGet();
    lShortFile = strrchr( lLoggingTls->file, '/' );
    lShortFile = lShortFile ? lShortFile + 1 : lLoggingTls->file;
    lBuf[ 0 ] = 0;
    if ( fmt ) {
        va_start( lArguments, fmt );
        #ifdef WIN32
            _vsnprintf( lBuf, sizeof(lBuf), fmt, lArguments );
        #else
            vsnprintf( lBuf, sizeof(lBuf), fmt, lArguments );
        #endif
        va_end(lArguments);
    }
    //fprintf( stderr, "%s %s: %s\n", gLoggingLevels[level], ltime(), lBuf );
    //fprintf( stderr, "%s %s %s[%d]: %s\n", gLoggingLevels[level], ltime(), lLoggingTls->file, lLoggingTls->line, lBuf );
    fprintf( stderr, "%s %s %s[%d]: %s\n", gLoggingLevels[level], ltime(), lShortFile, lLoggingTls->line, lBuf );
}

const char* ltime( void ) {
    time_t t = time( 0 );
    static char res[20];
    struct tm* ts;
    ts = localtime( &t );
    res[0] = '\0';
    sprintf( res, "%02d:%02d:%02d", ts->tm_hour, ts->tm_min, ts->tm_sec );
    return res;
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
#elif defined(Darwin)
ssize_t afy_sendfile( int sock, int fd, off_t* offset, size_t count ) {
	off_t len = count;
	return sendfile( fd, sock, offset ? *offset : 0, &len, NULL, 0 );
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
