IF(CMAKE_SYSTEM_NAME MATCHES Windows)
        cmake_minimum_required(VERSION 2.8)
ENDIF(CMAKE_SYSTEM_NAME MATCHES Windows)

message("Processing Affinity server/src ...")
SET(AFFINITYD_TARGET_NAME "affinityd")
SET(AFYDAEMON_TARGET_NAME "afydaemon")
SET(AFYCLIENT_TARGET_NAME "afyclient")
SET(AFYCTEST_TARGET_NAME "afyctest")
message("Project dir: " ${PROJECT_SOURCE_DIR})

if (NOT CMAKE_BUILD_TYPE)
set (CMAKE_BUILD_TYPE "Debug")
endif (NOT CMAKE_BUILD_TYPE)

message("System: ${CMAKE_SYSTEM}")
message("CPU type: ${CMAKE_SYSTEM_PROCESSOR}")
message("CMAKE_BUILD_TYPE: " ${CMAKE_BUILD_TYPE})

STRING( REGEX MATCH "86" CPUTYPE ${CMAKE_SYSTEM_PROCESSOR})
IF(${CPUTYPE} MATCHES "86")
	SET(CPUTYPE "x86")
	message ("CPU: " ${CPUTYPE} )
ELSE (${CPUTYPE} MATCHES "86")
    STRING( REGEX REPLACE "(^.*)([0-9]+).*" "\\1" CPUTYPE  ${CMAKE_SYSTEM_PROCESSOR})
	STRING( REGEX REPLACE "(^.*)([0-9]+).*" "\\2" CPV     ${CMAKE_SYSTEM_PROCESSOR})
	message ("CPU: " ${CPUTYPE} )
	message ("CPU version: " ${CPV})
	if(${CPV} LESS 6)
	   message ("DreamPlug")
	endif(${CPV} LESS 6) 
ENDIF(${CPUTYPE} MATCHES "86")

SET(AFFINITYD_SRC_DIR ${PROJECT_SOURCE_DIR}/src)
SET(AFFINITYD_INC_DIR ${PROJECT_SOURCE_DIR}/include)

SET(AFFINITY_PRJ "${PROJECT_SOURCE_DIR}/../kernel")
SET(AFFINITY_INC_DIR "${AFFINITY_PRJ}/include/")

INCLUDE_DIRECTORIES(${AFFINITYD_SRC_DIR} ${AFFINITYD_INC_DIR} ${AFFINITY_INC_DIR})

SET(LIBRARY_OUTPUT_PATH "${PROJECT_SOURCE_DIR}/lib")
SET(EXECUTABLE_OUTPUT_PATH "${PROJECT_SOURCE_DIR}/bin")

ADD_DEFINITIONS(-DAFFINITY_LINK)

IF(CMAKE_BUILD_TYPE MATCHES Debug)
	ADD_DEFINITIONS(-D_DEBUG)
	ADD_DEFINITIONS(-DDEBUG)
ELSE(CMAKE_BUILD_TYPE MATCHES Debug)
	ADD_DEFINITIONS(-DNDEBUG)
ENDIF(CMAKE_BUILD_TYPE MATCHES Debug)

IF(CMAKE_SYSTEM_NAME MATCHES Windows)
	ADD_DEFINITIONS(-DWIN32)
	ADD_DEFINITIONS(-D_WINDOWS)
	ADD_DEFINITIONS(-D_USRDLL)
	ADD_DEFINITIONS(-DPISTORE_EXPORTS)
	ADD_DEFINITIONS(-D_WINDLL)
	ADD_DEFINITIONS(-D_MBCS)
	ADD_DEFINITIONS(-D_CRT_SECURE_NO_DEPRECATE)
	ADD_DEFINITIONS(-D_CRT_NONSTDC_NO_DEPRECATE)
	SET( CMAKE_C_FLAGS  "/Gm /Zi /EHsc /GS /W3 /nologo /c /Gd /TP ")
	SET( CMAKE_CXX_FLAGS ${CMAKE_C_FLAGS})
ENDIF(CMAKE_SYSTEM_NAME MATCHES Windows)

IF(CMAKE_SYSTEM_NAME MATCHES Linux)
	ADD_DEFINITIONS(-D_LINUX)
	ADD_DEFINITIONS(-DPOSIX)
	ADD_DEFINITIONS(-DIA32)

IF(${CPUTYPE} MATCHES "x86")
IF(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64")
	SET( ARCH_C_FLAGS  "-march=nocona -m128bit-long-double -m64" )
ELSE(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64")
	SET( ARCH_C_FLAGS  "-march=i686 -m32" )
ENDIF(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64")
ENDIF(${CPUTYPE} MATCHES "x86")
IF(${CPUTYPE} MATCHES "arm")
	ADD_DEFINITIONS(-D_LSBF)
IF(${CPV} LESS 7)
    ADD_DEFINITIONS(-D_ARMLES6)	
	SET( CMAKE_CXX_FLAGS  "-march=armv5te -pthread -fexceptions -fno-strict-aliasing -W -Wall -Wno-parentheses -Wno-unused-parameter -fnon-call-exceptions -Wno-non-virtual-dtor -Wno-deprecated -Wno-write-strings ")
ELSE(${CPV} LESS 7)
     SET( CMAKE_CXX_FLAGS  "-mcpu=cortex-a9 -marm -pthread -fexceptions -fno-strict-aliasing -W -Wall -Wno-parentheses -Wno-unused-parameter -fnon-call-exceptions -Wno-non-virtual-dtor -Wno-deprecated -Wno-write-strings ")
ENDIF(${CPV} LESS 7)
ENDIF(${CPUTYPE} MATCHES "arm")

IF(CMAKE_BUILD_TYPE MATCHES Debug)
	SET( OPT_C_FLAGS "-g -O0" )
ELSE(CMAKE_BUILD_TYPE MATCHES Debug)
	SET( OPT_C_FLAGS "-g -O3" )
ENDIF(CMAKE_BUILD_TYPE MATCHES Debug)

SET( CMAKE_C_FLAGS "${ARCH_C_FLAGS} ${OPT_C_FLAGS} -W -Wall -fno-strict-aliasing -Wno-parentheses -Wno-unused-parameter -Wno-write-strings -Wpointer-arith" )
SET( CMAKE_CXX_FLAGS "${CMAKE_C_FLAGS} -fnon-call-exceptions -Wno-non-virtual-dtor -Wno-deprecated")

ENDIF(CMAKE_SYSTEM_NAME MATCHES Linux)

IF(CMAKE_SYSTEM_NAME MATCHES Darwin)
	ADD_DEFINITIONS(-D_LINUX)
	ADD_DEFINITIONS(-DPOSIX)
	ADD_DEFINITIONS(-DDarwin)
	ADD_DEFINITIONS(-DIA32)
	SET(CMAKE_C_FLAGS  "-m64  -g -O0 -fexceptions -fno-strict-aliasing -W -Wall -Wno-unused-parameter -fnon-call-exceptions -Wno-non-virtual-dtor -Wpointer-arith")
	SET(CMAKE_CXX_FLAGS  "-m64  -g -O0 -fexceptions -fno-strict-aliasing -W -Wall -Wno-unused-parameter -fnon-call-exceptions -Wno-non-virtual-dtor")
ENDIF(CMAKE_SYSTEM_NAME MATCHES Darwin)

SET(AFYDAEMON_SRCS afydaemon.c portability.c socket.c http.c storecmd.cpp storenotifier.cpp storebuiltinservices.cpp intr.c intr.h http.h portability.h socket.h storecmd.h storenotifier.h storebuiltinservices.h ../include/afydaemon.h ../include/afyhttp.h )
SET(AFFINITYD_SRCS ${AFYDAEMON_SRCS} affinityd.c)

SET(AFYCLIENT_SRCS afyclient.c portability.c socket.c http.c intr.c intr.h http.h portability.h socket.h ../include/afyclient.h ../include/afydaemon.h)
SET(AFYCTEST_SRCS ${AFYCLIENT_SRCS} afyctest.c)

IF(CMAKE_SYSTEM_NAME MATCHES Windows)
	SET(AFFINITYD_SRCS ${AFFINITYD_SRCS} ucgetopt.c)
	SET(AFYCTEST_SRCS ${AFYCTEST_SRCS} ucgetopt.c)
ENDIF(CMAKE_SYSTEM_NAME MATCHES Windows)

add_executable (${AFYCTEST_TARGET_NAME} ${AFYCTEST_SRCS})
SET_TARGET_PROPERTIES(${AFYCTEST_TARGET_NAME} PROPERTIES LINKER_LANGUAGE C)

	link_directories("${AFFINITY_PRJ}/lib")

add_executable (${AFFINITYD_TARGET_NAME} ${AFFINITYD_SRCS})
SET_TARGET_PROPERTIES(${AFFINITYD_TARGET_NAME} PROPERTIES LINKER_LANGUAGE CXX)

#adding the build target - affinityd dynamic library...
add_library (${AFYDAEMON_TARGET_NAME} SHARED ${AFYDAEMON_SRCS})
SET_TARGET_PROPERTIES(${AFYDAEMON_TARGET_NAME} PROPERTIES COMPILE_DEFINITIONS LIBRARY)
# COMPILE_DEFINITION also DYNAMIC_LIRBARY only not implemented yet

#adding the build target - afyclient dynamic library...
add_library (${AFYCLIENT_TARGET_NAME} SHARED ${AFYCLIENT_SRCS})
SET_TARGET_PROPERTIES(${AFYCLIENT_TARGET_NAME} PROPERTIES COMPILE_DEFINITIONS LIBRARY)
SET_TARGET_PROPERTIES(${AFYCLIENT_TARGET_NAME} PROPERTIES LINKER_LANGUAGE C)

IF(CMAKE_SYSTEM_NAME MATCHES Linux)
target_link_libraries (${AFFINITYD_TARGET_NAME} affinity rt dl pthread)
target_link_libraries (${AFYDAEMON_TARGET_NAME} affinity rt dl pthread)
target_link_libraries (${AFYCTEST_TARGET_NAME} rt pthread)
ENDIF(CMAKE_SYSTEM_NAME MATCHES Linux)

IF(CMAKE_SYSTEM_NAME MATCHES Windows)
target_link_libraries (${AFFINITYD_TARGET_NAME} affinity Ws2_32)
target_link_libraries (${AFYDAEMON_TARGET_NAME} affinity Ws2_32)
target_link_libraries (${AFYCTEST_TARGET_NAME} Ws2_32)
target_link_libraries (${AFYCLIENT_TARGET_NAME} Ws2_32)
ENDIF(CMAKE_SYSTEM_NAME MATCHES Windows)

IF(CMAKE_SYSTEM_NAME MATCHES Darwin)
target_link_libraries (${AFFINITYD_TARGET_NAME} affinity)
target_link_libraries (${AFYDAEMON_TARGET_NAME} affinity)
ENDIF(CMAKE_SYSTEM_NAME MATCHES Darwin)
