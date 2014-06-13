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

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "afyclient.h"
#include "portability.h"
#include "http.h"
#include "socket.h"
#include "afyhttp.h"

int afyc_connect( afyc_t* db, const char* host, uint16_t port, 
                 const char* identity, const char* store,
                 const char* user, const char* pass ) {
    db->host = host; db->port = port;
    db->identity = identity; db->store = store;
    db->user = user; db->pass = pass;
    db->body = NULL; db->body_len = 0;
    db->clen = -1;
    db->buf[0] = '\0';
    db->chunk = 0;
    sock_init();
    db->ka = 1;                 /* keep-alive on by default */
    db->url = 0;                /* url-encode off by default */
    db->sock = sock_connect( host, port );
    if ( db->sock == -1 ) { return AFYC_CONNECTION_FAIL; }
    return 1;
}

int afyc_reconnect( afyc_t* db ) {
    if ( db->sock >= 0 ) { return 0; }
    db->sock = sock_connect( db->host, db->port );
    if ( db->sock == -1 ) { return AFYC_CONNECTION_FAIL; }
    return 1;
}

ssize_t afyc_resp( afyc_t* db ) {
    char *headers = NULL, *code = NULL, *length = NULL, *chunk = NULL;
    char undo = '\0', *end = NULL;
    int blen, rd = 0;
    int ncode = -1;
    /* read the response up to \r\n\r\n or AFYC_BUF_SIZE */
    /* reuse the buffer */

    for ( rd = 1, blen = 0, db->body = NULL, db->buf[0] = '\0';
          rd > 0 && !db->body && blen < AFYC_BUF_SIZE; blen += rd ) {
        rd = recv( db->sock, db->buf+blen, AFYC_BUF_SIZE-blen, 0 );
        if ( rd > 0 ) {
            db->buf[blen+rd] = '\0'; /* null term as a string */
            db->body = strstr( db->buf, CRLF CRLF );
        }
    }
    if ( rd <= 0 || blen >= AFYC_BUF_SIZE || !db->body ) { 
        afyc_disconnect( db );
        return AFYC_CONNECTION_FAIL; 
    }

    headers = db->buf;
    db->body += 2;
    *(db->body) = '\0';  /* headers should include 1x trailing \r\n */
    db->body += 2;       /* body should start after \r\n\r\n */
    /* non-header data already read for later streaming */
    db->body_len = blen - (db->body - db->buf);

    /* parse response code */

    code = http_parse( headers, HTTP, strlen( HTTP ), &undo, &end );
    if ( !code ) { return -1; }

    ncode = atoi( code );
    undo_parse( undo, end );

    end[-1] = '\0';
    headers = end;              /* headers should include leading \r\n */

    /* parse content-length if any from headers */

    db->clen = -1;
    length = http_parse( headers, CRLF LENGTH, strlen( CRLF LENGTH ), 
                         &undo, &end );
    if ( length ) {
        db->clen = atoi( length ); undo_parse( undo, end );
    } 

    db->chunked = 0;
    chunk = http_parse( headers, CRLF TRANSFER, strlen( CRLF TRANSFER ), 
                        &undo, &end );
    if ( chunk && strncasecmp( chunk, CHUNKED, strlen( CHUNKED ) == 0 ) ) {
        db->chunked = 1;
    }

    /* return syntax error code */

    if ( ncode >= 300 ) { return AFYC_SQL_ERROR;; }
    return 1;
}

#define GET_CODE 1
#define POST_CODE 2

#define POST_QUERY "query="

/*	ofmt -- output format: 	"proto" -- protobuf, others/ default is JSON
	method: 0 (auto), 1 (GET), 2 (POST)
	type: count|plan|display|query
	offset & limit: control the returned result count and begin position
 */

int afyc_create( afyc_t* admin, const char* store ) {
    int res;
    if ( admin->sock < 0 ) {
        res = afyc_reconnect( admin );
        if ( res == AFYC_CONNECTION_FAIL ) { return res; }
    }
    res = afyc_sql( admin, "create", GET, JSON, CREATE, 0, 0 );
    return res;
}

int afyc_drop( afyc_t* admin, const char* store ) {
    int res;
    if ( admin->sock < 0 ) {
        res = afyc_reconnect( admin );
        if ( res == AFYC_CONNECTION_FAIL ) { return res; }
    }
    res = afyc_sql( admin, "drop", GET, JSON, DROP, 0, 0 );
    return res;
}

int afyc_sql( afyc_t* db, const char* query, const char* method, 
             oformat_t ofmt, query_t type, 
             size_t offset, size_t limit ) {
    int blen, qlen, rd, used, elen = 0;
    int meth = 0;
    char clen_str[40], soffset[40], slimit[40];

    soffset[0] = '\0';
    slimit[0] = '\0';
    clen_str[0] = '\0';

    if ( offset ) { snprintf( soffset, sizeof(soffset), "&off=%lu", ( unsigned long )offset ); }
    if ( limit ) { snprintf( slimit, sizeof(slimit), "&lim=%lu", ( unsigned long )limit ); }

    if ( query ) { elen = url_encode_len( query, 0, NULL ); }

    if ( method == NULL ) { /* automatically choose appropriate method  */
        /* worst case 4k for headers  */
        meth = (!query || elen > 10000) ? POST_CODE : GET_CODE; 
    } else {
        if ( strcasecmp( method, GET ) == 0 ) {
            meth = GET_CODE;
        } else if ( strcasecmp( method, POST ) == 0 ) {
            meth = POST_CODE;
        } else {
            return -1;          /* unsupported request method */
        }
    }
    if ( db->sock < 0 ) { 
        return AFYC_CONNECTION_FAIL;
    }
    if ( meth == GET_CODE ) {
        if ( type == CREATE || type == DROP ) {
            blen = snprintf( db->buf, AFYC_BUF_SIZE, "GET %s", 
                             type == CREATE ? 
                             AFYD_CREATE_ALIAS : AFYD_DROP_ALIAS );
        } else { 
            blen = snprintf( db->buf, AFYC_BUF_SIZE, "GET %s/q=", 
                             AFYD_QUERY_ALIAS );
            blen += url_encode( query, db->buf+blen, AFYC_BUF_SIZE-blen, NULL );
        }
        blen += snprintf( db->buf+blen, AFYC_BUF_SIZE-blen, 
                          "%s%s%s%s HTTP/1.1\r\n"
                          "Host: %s:%d\r\n"
                          "User-Agent: %s/%1.2f\r\n" 
                          "%s"  /* optional Connection: close */
                          "\r\n",
                          ((ofmt == PROTOBUF) ? "&o=proto":""),
                          ((type == QUERY) ? "": 
                           ((type == EXPRESSION) ? "&t=expression":
                            ((type == COUNT) ? "&t=count" :
                             ((type == PLAN) ? "&t=plan" : 
                              ((type == CREATE || type == DROP) ? "" :
                               "&t=display"))))),
                          soffset, slimit, 
                          db->host, db->port, "afyclient", AFYD_VERS,
                          !db->ka ? "Connection: close\r\n" : "" );
        rd = sock_write( db->sock, db->buf, blen );
        if ( rd < blen ) { afyc_disconnect( db ); return AFYC_CONNECTION_FAIL; }
    } else if ( meth == POST_CODE ) {
        /* close or keep-alive with length or chunked logic */
        /* if -c is called db->ka should be disabled */
        /* if -c is called, query == NULL, so disable db->ka */
        if ( !query ) { db->ka = 0; }
        db->chunked = 0;
        db->url = 0;
        if ( db->ka ) {         /* keep-alive */
            if ( query ) {      /* Content-Length known */
                sprintf( clen_str, "Content-Length: %lu\r\n", 
                         ( unsigned long )strlen(POST_QUERY)+elen );
            } else {
                sprintf( clen_str, "Transfer-Encoding: chunked\r\n" );
                db->chunked = 1;
            }
        } else { /* Connection: close & no Content-Length */
            sprintf( clen_str, "Connection: close\r\n" );
        }
        blen = snprintf( db->buf, AFYC_BUF_SIZE, 
                         "POST %s/%s%s%s%s HTTP/1.1\r\n"
                         "Host: %s:%d\r\n"
                         "User-Agent: %s/%1.2f\r\n"
                         TYPE MIME_URL CRLF
                         "%s"   /* Content-Len, chunked or Conn: close */
                         "\r\n",
                         AFYD_QUERY_ALIAS,
                         ((ofmt == PROTOBUF) ? "&o=proto":""),
                         ((type==QUERY)? "": 
                          ((type==EXPRESSION) ?" &t=expression" :
                           ((type==COUNT) ?" &t=count" :
                            ((type==PLAN) ? "&t=plan" :
                             ((type == CREATE || type == DROP) ? "" :
                              "&t=display"))))),
                         soffset, slimit, 
                         db->host, db->port, "afyclient", AFYD_VERS, clen_str );
        rd = sock_write( db->sock, db->buf, blen );
        if ( rd < blen ) { afyc_disconnect( db ); return AFYC_CONNECTION_FAIL; }
        rd = afyc_write( db, POST_QUERY, strlen( POST_QUERY ) );
        db->url = 1;
        if ( rd < (int)strlen( POST_QUERY ) ) {
            afyc_disconnect( db ); return AFYC_CONNECTION_FAIL; 
        }
        if ( !query ) { return AFYC_CONTINUE; }
        /* auto url-encode because db->url is set */
        /* also auto chunk if db->chunked is set */
        qlen = strlen( query );
        used = afyc_write( db, query, qlen );

        if ( used < qlen ) {
            afyc_disconnect( db ); return AFYC_CONNECTION_FAIL;
        }
    } else {
        return AFYC_ERROR;       /* internal error */
    }

    rd = afyc_resp( db );
    if ( rd < 0 ) { return rd; }

    return 1;
}

/* this does not handle chunk length fields split between buf and socket */

ssize_t afyc_read( afyc_t* db, void* in, size_t in_len ) {
    size_t use_len = 0;
    int res = 0;
    char* end = NULL, *chunk = NULL;
    if ( in_len == 0 || db->clen == 0 ) { return 0; }

    if ( db->clen > 0 ) { in_len = MIN( in_len, (size_t)db->clen ); }

    if ( db->chunked && db->chunk == 0 && db->body_len == 0 ) {
        res = recv( db->sock, db->body, 10, 0 );
        if ( res < 3 ) {
            afyc_disconnect( db ); return AFYC_CONNECTION_FAIL;
        }
        db->body[res] = '\0';
        db->body_len = res;
    }

    if ( db->body_len > 0 ) {
        if ( !db->body ) { return -2; } /* internal error */
        if ( db->chunked && db->chunk == 0 ) {
            chunk = strstr( db->body, CRLF );
            if ( chunk ) { db->chunk = (size_t)strtol( db->body, &end, 16 ); }
            if ( !chunk || end != chunk ) {
                afyc_disconnect( db ); return AFYC_CONNECTION_FAIL; 
            }
            if ( db->chunk == 0 ) { return 0; }
            use_len = (size_t)(end - db->body) + strlen(CRLF);
            db->body_len -= use_len;
            db->body += use_len;
        }
        use_len = MIN( in_len, db->body_len );
        if ( db->chunk > 0 ) { use_len = MIN( use_len, db->chunk ); }
        memcpy( in, db->body, use_len );
        db->body_len -= use_len; db->body += use_len; 
        if ( db->clen > 0 ) { db->clen -= use_len; }
        if ( db->chunk > 0 ) { db->chunk -= use_len; }
        /* if done reset for re-use */
        if ( db->body_len == 0 ) { 
            db->body = db->buf; 
        }
    }
    if ( use_len == in_len ) { return use_len; }

    if ( db->sock < 0 ) { return AFYC_CONNECTION_FAIL; }

    /* pass through to avoid memcpy */
    res = recv( db->sock, (char*)in + use_len, in_len - use_len, 0 );
    if ( res <= 0 ) { afyc_disconnect( db ); return AFYC_CONNECTION_FAIL; }
    if ( db->clen > 0 ) { db->clen -= res; }

    return use_len + res;
}

ssize_t afyc_read_old( afyc_t* db, void* in, size_t in_len ) {
    int res = 0;
    if ( db->clen == 0 ) { return -1; } /* eof */
    if ( db->clen >= 0 ) { in_len = MIN( in_len, (size_t)db->clen ); }
    if ( db->body_len > 0 ) {
        if ( !db->body ) { return -2; } /* internal error */
        in_len = MIN( in_len, db->body_len );
        memcpy( in, db->body, in_len );
        db->body_len -= in_len; db->body += in_len; 
        if ( db->clen > 0 ) { db->clen -= in_len; }
        return in_len;
    }
    if ( db->sock < 0 ) { return AFYC_CONNECTION_FAIL; }
    /* pass through to avoid memcpy */
    
    if ( in_len == 0 ) { return 0; }
    res = recv( db->sock, in, in_len, 0 );
    if ( res <= 0 ) { afyc_disconnect( db ); return AFYC_CONNECTION_FAIL; }
    if ( db->clen > 0 ) { db->clen -= res; }
    return res;
}

ssize_t afyc_write( afyc_t* db, const void* out, size_t out_len ) {
    size_t used = 0, chunk, rd, off, sent, elen;
    char exp[10+1];
    if ( db->url ) {
        /* note out_len is ignored by this for now, so must '\0' term out */
        if ( strlen( out ) != out_len ) { return AFYC_ERROR; }
        for ( rd = 1, sent = 0, off = 0; rd > 0; ) {
            chunk = url_encode( (char*)out+off, db->buf, AFYC_BUF_SIZE, &used );
            if ( db->chunked ) {
                exp[0] = '\0';
                elen = snprintf( exp, 10, "%lx\r\n", ( unsigned long )chunk );
                rd = sock_write( db->sock, exp, elen );
                if ( rd <= 0 ) { continue; }
            }
            rd = sock_write( db->sock, db->buf, chunk );
            if ( rd <= 0 ) { continue; }
            if ( db->chunked ) {
                rd = sock_write( db->sock, CRLF, strlen(CRLF) );
                if ( rd <= 0 ) { continue; }
            }
            off += used; sent += rd;
        }
        return off;             /* in terms relative to out_len, */
    } else {                    /* @@ non-url needs chunked support also */
        return sock_write( db->sock, out, out_len );
    }
}

#define CHUNK_END "0\r\n\r\n"

int afyc_done( afyc_t* db ) {
    size_t rd;
    if ( !db->ka ) {
        if ( !sock_halfshut( db->sock ) ) { /* half-close */
            afyc_disconnect( db ); return AFYC_CONNECTION_FAIL;
        }
    } else if ( db->chunked ) {
        rd = sock_write( db->sock, CHUNK_END, strlen( CHUNK_END ) );
        if ( rd < strlen( CHUNK_END ) ) {
            afyc_disconnect( db ); return AFYC_CONNECTION_FAIL;
        }
    }
    /* wait for response header */
    /* fyi the response could have a content-length, but the connect */
    /* remains non keep-alive as the request wasnt */
    return afyc_resp( db );
}

int afyc_disconnect( afyc_t* db ) {
    int res;
    if ( db->sock >= 0 ) { 
        res = shutdown( db->sock, SHUT_RDWR );
        closesocket( db->sock );
        db->sock = -1;
    }
    return 1;
}

#ifdef MVCLIENT_TEST
int main( int argc, char* argv[] ) {
    
}
#endif
