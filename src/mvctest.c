/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#include "mvclient.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "portability.h"
#include "mvdaemon.h"
#include "mvhttp.h"

#define BUF_SIZE 16384

#define CMD_QUERY "query "
#define CMD_QUERY_LEN strlen( CMD_QUERY )
#define CMD_CREATE "create"
#define CMD_CREATE_LEN strlen( CMD_CREATE )
#define CMD_DROP "drop"
#define CMD_DROP_LEN strlen( CMD_DROP )
#define CMD_EXPRESSION "expression "
#define CMD_EXPRESSION_LEN strlen( CMD_EXPRESSION )
#define CMD_COUNT "count "
#define CMD_COUNT_LEN strlen( CMD_COUNT )
#define CMD_PLAN "plan "
#define CMD_PLAN_LEN strlen( CMD_PLAN )
#define CMD_DISPLAY "display "
#define CMD_DISPLAY_LEN strlen( CMD_DISPLAY )
#define CMD_OFFSET "offset "
#define CMD_OFFSET_LEN strlen( CMD_OFFSET )
#define CMD_LIMIT "limit "
#define CMD_LIMIT_LEN strlen( CMD_LIMIT )

int cmd_send( mvc_t* db, const void* buf, size_t buf_len ) {
    size_t res = mvc_write( db, (char*)buf, buf_len );
    if ( res < buf_len ) { mvc_disconnect( db ); return 0; }
    return mvc_done( db );
}

int cmd_recv( mvc_t* db, FILE* f ) {
    int len = 1, olen = 0;
    char buf[BUF_SIZE+1];

    buf[0] = '\0';
    while ( len > 0 ) {	/* read to EOF == end of query response */
	len = mvc_read( db, buf, BUF_SIZE );
	if ( len > 0 ) {
	    buf[len] = '\0';	/* fputs works on 0 terminated strings */
	    fputs( buf, f );
            olen = len;
	}
    }
    /* nice to have a \n on the end not to mess up the interpreter prompt */
    if ( olen > 0 && buf[olen-1] != '\n' ) { fputc( '\n', f ); }
    if ( len < 0 ) { return 0; }
    return 1;
}

#define MAX_CMD 10240
#define CMD_QUIT "quit"
#define CMD_RECONNECT "reconnect"

int verbose = 0;

#define WHITE_SPACE "\r\n \t"

size_t chomp( char* cmd ) {
	size_t cmd_len = strlen( cmd );
	while ( cmd_len > 0 && strchr( WHITE_SPACE, cmd[cmd_len-1] ) ) {
        cmd[cmd_len-1] = '\0'; cmd_len--;
    }
	return cmd_len;
}

void print_help( void ) {
    fprintf( stderr, 
             "mvctest [options]\n\n"
             "-h\t\t\thelp\n"
             "-s <server>\t\tserver name (default localhost)\n"
             "-p <port>\t\tport (defaults to 4560)\n"
             "-t <GET|POST>\t(defaults to auto -- GET under 10KB, POST over)\n"
             "-c\t\t\tconnection: close (aka streaming/no keep-alive)\n"
             "-q <query>\t\tquery to run and exit\n"
             "-v\t\t\tbe more verbose\n"
             "-V\t\t\tprint version and exit\n" );
    return;
}

int close_flag = 0;

int main( int argc, char* argv[] ) {
    int res, opt, port = 4560, prefix = 0;
    size_t cmd_len = 0, cmp_len = 0, offset = 0, limit = 0;
    char cmd_dat[MAX_CMD+1], *cmd = cmd_dat, *endp = NULL;
    char *host = "localhost", *end=NULL, *enc = NULL, *query = NULL;
    mvc_t user, admin, *db = &user;
    query_t type = QUERY;

    while ( (opt=getopt(argc, argv, "chs:t:p:q:vV" )) > 0 ) {
        switch ( opt ) {
        case 'c': close_flag = 1; break;
        case 'h': print_help(); exit( EXIT_FAILURE ); break;
        case 's': host = optarg; break;
        case 'p': port = atoi( optarg ); break;
        case 't': enc = optarg; break;
        case 'q': query = optarg; break;
        case 'v': verbose = 1; break;
        case 'V': 
            fprintf( stderr, "Version: %1.2f\n", MVD_VERS ); 
            exit( EXIT_FAILURE );
            break;
        }
    }

    if ( close_flag && strcasecmp( enc, "get" ) == 0 ) {
        fprintf( stderr, "warning: cant do close GET, ignoring close\n" );
        close_flag = 0;         /* cant do close GET */
    }

    res = mvc_connect( &user, host, port, "test", "default", "user", "pass" );
    if ( res == MVC_CONNECTION_FAIL ) {
        fprintf( stderr, "error: failed to connect to server %s port %d\n",
                 user.host, user.port ); 
    }

    res = mvc_connect( &admin, host, port, "admin", "none", "user", "pass" );
    if ( res == MVC_CONNECTION_FAIL ) {
        fprintf( stderr, "error: failed to connect to server %s port %d\n",
                 admin.host, admin.port ); 
    }
    do {
        type = QUERY;
        prefix = 0;
        offset = 0;
        limit = 0;
        db = &user;
        if ( query ) { 
            cmd = query;
            cmd_len = strlen( query );
        } else {
            fprintf( stderr, "mvsql> " );
            cmd[0] = '\0';
            fgets( cmd, MAX_CMD, stdin );
            if ( cmd[0] == '\0' ) { fputc( '\n', stderr ); break; }
            cmd_len = chomp( cmd );
            end = strchr( cmd, ';' );
            /* ignore trailing whitespace */
            if ( end ) { while ( end > cmd && end[-1] == ' ' ) { end--; } }
            cmp_len = end ? (size_t)(end-cmd) : cmd_len;
            if ( strncasecmp( cmd, CMD_QUIT, cmp_len ) == 0 ) { break; 
            } else if ( strncasecmp( cmd, CMD_CREATE, CMD_CREATE_LEN ) == 0 ) {
                type = CREATE; prefix = 0; db = &admin;
            } else if ( strncasecmp( cmd, CMD_DROP, CMD_DROP_LEN ) == 0 ) {
                type = DROP; prefix = 0; db = &admin;
            } else if ( strncasecmp( cmd, CMD_QUERY, CMD_QUERY_LEN ) == 0 ) {
                type = QUERY; prefix = CMD_QUERY_LEN;
            } else if ( strncasecmp( cmd, CMD_EXPRESSION, 
                                     CMD_EXPRESSION_LEN ) == 0 ) {
                type = EXPRESSION; prefix = CMD_EXPRESSION_LEN;
            } else if ( strncasecmp( cmd, CMD_COUNT, CMD_COUNT_LEN ) == 0 ) {
                type = COUNT; prefix = CMD_COUNT_LEN;
            } else if ( strncasecmp( cmd, CMD_PLAN, CMD_PLAN_LEN ) == 0 ) {
                type = PLAN; prefix = CMD_PLAN_LEN;
            } else if ( strncasecmp( cmd, CMD_DISPLAY, CMD_DISPLAY_LEN )==0 ) {
                type = DISPLAY; prefix = CMD_DISPLAY_LEN;
            } else if ( strncasecmp( cmd, CMD_RECONNECT, cmp_len ) == 0 ) { 
                cmd_len = 0;
                res = mvc_reconnect( db );
                if ( res < 0 ) {
                    if ( res == MVC_CONNECTION_FAIL ) {
                        fprintf( stderr, "error: failed to connect to "
                                 "server %s port %d\n", db->host, db->port ); 
                    } else {
                        fprintf( stderr, "error: reconnected failed\n" );
                    }
                }
            }
            if ( strncasecmp( cmd+prefix, CMD_OFFSET, CMD_OFFSET_LEN ) == 0 ) {
                prefix += CMD_OFFSET_LEN;
                offset = strtoul( cmd+prefix, &endp, 10 );
                prefix += endp - (cmd+prefix);
                while ( cmd[prefix] == ' ' ) { prefix++; }
            }
            if ( strncasecmp( cmd+prefix, CMD_LIMIT, CMD_LIMIT_LEN ) == 0 ) {
                prefix += CMD_LIMIT_LEN;
                limit = strtoul( cmd+prefix, &endp, 10 );
                prefix += endp - (cmd+prefix);
                while ( cmd[prefix] == ' ' ) { prefix++; }
            }
            if ( strncasecmp( cmd+prefix, CMD_OFFSET, CMD_OFFSET_LEN ) == 0 ) {
                prefix += CMD_OFFSET_LEN;
                offset = strtoul( cmd+prefix, &endp, 10 );
                prefix += endp - (cmd+prefix);
                while ( cmd[prefix] == ' ' ) { prefix++; }
            }
        }
        if ( cmd_len > 0 ) {
            if ( type == CREATE ) {
                res = mvc_create( &admin, "default" );
                mvc_disconnect( &user );
            } else if ( type == DROP ) {
                res = mvc_drop( &admin, "default" );
                mvc_disconnect( &user );
            } else {
                res = mvc_sql( db, close_flag ? NULL : cmd + prefix, enc, 
                               JSON, type, offset, limit );
            }
            if ( res < 0 ) {
                switch ( res ) {
                case MVC_SQL_ERROR:
                    fputs( cmd, stderr );
                    fputc( '\n', stderr );
                    cmd_recv( db, stderr );
                    break;
                case MVC_CONNECTION_FAIL:
                    fprintf( stderr, "lost connection to server\n" );
                    break;
                case MVC_UNSUPPORTED:
                    fprintf( stderr, "unsupported request type\n" );
                    break;
                case MVC_ERROR:
                    fprintf( stderr, "mvclient internal error\n" );
                    break;
                }
            } else {
                if ( res == MVC_CONTINUE ) {
                    if ( !cmd_send( db, cmd, strlen(cmd) ) ) {
                        fprintf( stderr, "lost connection to server\n" );
                        continue;
                    } 
                }
                if ( !cmd_recv( db, stderr ) ) {
                    fprintf( stderr, "lost connection to server\n" );
                }
            }
        }
    } while ( !query );
    mvc_disconnect( &user );
    mvc_disconnect( &admin );
    exit( res > 0 ? EXIT_SUCCESS : EXIT_FAILURE );
}
