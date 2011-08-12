/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "portability.h"
#include "mvhttp.h"
#include "mvdaemon.h"

/* MVSTORED: an embedded server - simple, threading so allowing
   blocking, CPU and IO intensive DB calls, also includes a static web
   server and basic mime support */

int print_help( void ) {
    fprintf( stderr, "usage: mvstored [options]\n"
             "-d\tdocroot directory\n"
             "-h\thelp\n"
             "-p\tport number to listen on\n"
             "-V\tprint version number\n" );
    return 1;
}

#define BUF_SIZE 16384

int main( int argc, char* argv[] ) {
    int opt;
    int verbose = 0, auto_create = 0, res;
    int http_port = MVD_PORT;
    char* www = NULL, *store = NULL;

    while ( (opt=getopt(argc, argv, "ad:hp:s:vV" )) > 0 ) {
	switch( opt ) {
        case 'a': auto_create = 1;
	case 'd': www = optarg; break;
	case 'h': print_help(); exit( EXIT_FAILURE); break;
	case 'p': http_port = atoi(optarg); break;
        case 's': store = optarg; break;
        case 'v': verbose++; break;
	case 'V': 
            fprintf( stderr, "Version: %1.2f\n", MVD_VERS ); 
            exit( EXIT_FAILURE );
            break;
	}
    }

    if ( www ) {            /* we want -d to override $DOCROOT here */
        putenv( "DOCROOT" );    /* aka unsetenv */
    }
    if ( !www && fisdir( "www" ) ) { www = "www"; }     /* debug helpers */
    if ( !store && fisdir( "store" ) ) { store = "store"; }

    res = mvdaemon( NULL, www, store, http_port, verbose, auto_create );

    exit( res ? EXIT_SUCCESS : EXIT_FAILURE );
}
