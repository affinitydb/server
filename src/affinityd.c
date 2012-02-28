/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */
/*
Copyright (c) 2004-2012 VMware, Inc. All Rights Reserved.

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

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "portability.h"
#include "afyhttp.h"
#include "afydaemon.h"

/* AFFINITYD: an embedded server - simple, threading so allowing
   blocking, CPU and IO intensive DB calls, also includes a static web
   server and basic mime support */

int print_help( void ) {
    fprintf( stderr, "usage: affinityd [options]\n"
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
    int http_port = AFYD_PORT;
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
            fprintf( stderr, "Version: %1.2f\n", AFYD_VERS ); 
            exit( EXIT_FAILURE );
            break;
	}
    }

    if ( www ) {            /* we want -d to override $DOCROOT here */
        putenv( "DOCROOT" );    /* aka unsetenv */
    }
    if ( !www && fisdir( "www" ) ) { www = "www"; }     /* debug helpers */
    if ( !store && fisdir( "store" ) ) { store = "store"; }

    res = afydaemon( NULL, www, store, http_port, verbose, auto_create );

    exit( res ? EXIT_SUCCESS : EXIT_FAILURE );
}
