/* code to create alpha table for base64 decode  */

/* the cmake setup seems to be a bit simplistic so to avoid it trying
 * to link this, you now have to define BASE64_GEN for this code to be
 * compiled!
 */

#ifdef BASE64_GEN
#include <stdio.h>

int decode(char c) {
  if(c >= 'A' && c <= 'Z') return(c - 'A');
  if(c >= 'a' && c <= 'z') return(c - 'a' + 26);
  if(c >= '0' && c <= '9') return(c - '0' + 52);
  if(c == '+')             return 62;
  if(c == '/')             return 63;
  if(c == '=')    	   return 0;
  return -1;
}

int main( int argc, char* argv[] ) {
  int i;
  printf( "int alpha[256] = {" );
  for ( i = 0; i < 256; i++ ) {
    if ( i % 16 == 0 ) { printf( "\n" ); }
    printf( "%d,", decode( i ) );
  }
  printf( "\n};\n" );
}
#endif
