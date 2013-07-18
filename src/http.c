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

#include <string.h>
#include <stdio.h>
#include <time.h>
#include <ctype.h>
#include "http.h"

#if 0
/* more conventional stacked reader, but inefficient */

/* figured out incremental read hack instead for chunked - probably
 * more efficient and simpler than this, though still not quite
 * optimal */

typedef struct reader_s {
    void* param;
    size_t (*reader)( reader_t*, void*, size_t );
} reader_t;

ssize_t raw_read( reader_t* r, void* buf, size_t buf_len ) {
    ssize_t got, res;
    for ( got = 0, res = 1; res > 0 && got < buf_len; got += res ) { 
        res = recv( (int)r->param, buf+got, buf_len-got, 0 );
        if ( res < 0 ) { return res; }
    }
    return got;
}

#define BUF_SIZE 1024

#define BFREE( r ) (BUF_SIZE - ((size_t)r->ptr - r->buf))
#define BAVAIL( r ) ((size_t)r->ptr - r->unread)
#define BUSED( r ) ((size_t)r->unread - r->buf)

/* ring buffer would be cleverer */

#define BCOMPACT( r ) do {                              \
    if ( BUSED( r ) > 0 ) { /* compact */               \
        memcpy( r->buf, r->unread, BAVAIL( r ) );       \
        r->ptr -= BAVAIL( r );                          \
        r->unread = r->buf;                             \
    } while (0)

ssize_t buffered_read( reader_t* r, void* buf, size_t buf_len ) {
    ssize_t res = 0;
    size_t use_len = 0;
    if ( buf_len == 0 ) { return 0; }
    if ( BAVAIL( r ) > 0 ) {
        use_len = MIN( buf_len, BAVAIL( r ) );
        memcpy( buf, r->unread, use_len );
        r->unread += use_len;
        if ( r->ptr == r->unread ) { r->unread = r->ptr = r->buf; }
    }
    if ( use_len == buf_len ) { return use_len; }
    /* otherwise use_len < buf_len */
    res = r->read( r, buf+use_len, buf_len-use_len );
    if ( res < 0 ) { return res; }
    return use_len+res;
}

int buffered_pushback( reader* r, const void* buf, size_t buf_len ) {
    size_t avail;
    if ( buf_len == 0 ) { return 0; }
    if ( BFREE( r ) < buf_len ) { 
        BCOMPACT( r );
        if ( BFREE( r ) < 0 ) { return 0; }
    }
    memcpy( r->ptr, buf, buf_len );
    r->ptr += buf_len;
    return 1;
}

ssize_t chunked_read( reader_t* r, void* buf, size_t buf_len ) {
    char* end = NULL, buf[BUF_SIZE+1];
    size_t chunk = 0, spare;
    ssize_t lres;
    lres = r->read( r, buf, BUF_SIZE );
    if ( lres < 0 ) { return lres; }
    length[lres] = '\0';
    end = strstr( length, "\r\n" );
    if ( !end ) { return -1; }
    *end = '\0';
    res = sscanf( length, "%x", &chunk );
    *end = '\n';
    if ( res != 1 ) { return -1; }
    if ( chunk == 0 ) { return 0; }
    spare = lres - (ssize_t)(end - length);
    
    buffered_pushback( r, buf, spare );
}

size_t http_read( reader_t* r, void* buf, size_t buf_len ) {
    
}
#endif

int url[256] = {
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,1,2,3,4,5,6,7,8,9,-1,-1,-1,-1,-1,-1,
  -1,10,11,12,13,14,15,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,10,11,12,13,14,15,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
};

ssize_t url_decode( const char* u, char* d, size_t dlen ) {
    char* o = d ? d : (char*)u;	/* in place if d == NULL */
    char* s = o;
    if ( u == NULL ) { return 0; }
    while ( *u ) {
	if ( *u == '%' ) {
	    if ( u[1] && u[2] && url[(int)u[1]] >=0 && url[(int)u[2]] >= 0 ) {
		*o = 16*url[(int)u[1]]+url[(int)u[2]];
	    }
	    if ( u[1] ) { u += u[2] ? 2 : 1; }
	} else if ( *u == '+' ) {
	    *o = ' ';
	} else {
	    if ( u != o ) { *o = *u; }
	}
	u++;
	o++;
	if ( dlen && (size_t)(o-s) > dlen ) { return -1; } /* overflow */
    }
    if ( u != o ) { *o = '\0'; }
    return (ssize_t)(o-s);
}

const char* special = "$-_. !*'(),";
const char* b64 = "0123456789ABCDEF";

#define isurl(x) ( isalnum(x) || strchr( special, x ) )

size_t url_encode_len( const char* d, size_t blen, size_t* dlen ) {
    size_t olen, i;
    const char* s;
    if ( d == NULL ) { return 0; }
    s = d;
    for ( i = 0, olen = 0; d[i] && (!blen || olen < blen); i++, olen++ ) {
	if ( !isurl( d[i] ) ) { olen += 2; }
    }
    if ( blen && i > 0 && olen > blen ) {
        i--; olen--; 
        if ( !isurl( d[i] ) ) { olen -=2; }
    }
    if ( dlen ) { *dlen = i; }
    return olen;
}

ssize_t url_encode( const char* d, char* e, size_t elen, size_t *odlen ) {
    size_t olen, dlen, tlen;
    ssize_t i;
    char* o = e ? e : (char*)d;
    if ( !d ) { return 0; }
    dlen = strlen(d);
    olen = url_encode_len( d, elen, &tlen );
    if ( tlen < dlen && !odlen ) { return -1; } /* cant do reverse in-place */
    dlen = tlen;
    o += olen;
    o[0] = '\0';
    for ( i = (ssize_t)dlen-1; i >= 0; i-- ) {
        if ( !isurl( d[i] ) ) { 
            o[-3] = '%';
            o[-2] = b64[ d[i] >> 4 ];
            o[-1] = b64[ d[i] & 0xF ];
            o -= 2;
        } else if ( d[i] == ' ' ) {
            o[-1] = '+';
        } else if ( o-1 != d ) {
            o[-1] = d[i];
        }
        o--;
    }
    if ( odlen ) { *odlen = dlen; }
    return (ssize_t)olen;
}

/* kind of undoable strsep */
char* http_parse( char* headers, const char* header, size_t header_len,
                  char* undo, char** end ) {
    char* found = strstr( headers, header ), *value = NULL, *endp = NULL;
    if ( !found ) { return NULL; }
    value = found + header_len;
    if ( !end ) { end = &endp; }
    *end = strpbrk( value, CRLF );
    if ( undo ) { *undo = **end; }
    **end = '\0';
    return value;
}
