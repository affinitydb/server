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

#if !defined(POSIX) && !defined(WIN32)
    // For python distutils... I may find a better solution with their 'define_macros'.
    #define POSIX
#endif
#include <sstream>
#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>
#if !defined(Darwin)
#include <malloc.h>
#endif
#include <errno.h>
#include "startup.h"
#include "affinity.h"
#include "portability.h"
#include "storenotifier.h"

using namespace AfyDB;

#ifdef WIN32
#define _LX_FM "%016I64X"
#else
#define _LX_FM "%016LX"
#endif

/**
 * WaitableEvent
 */
#ifndef WIN32
WaitableEvent::WaitableEvent()
    : mUseCount(1), mRegCount(0), mLastWaitTermination(0), mSem(semget(IPC_PRIVATE, 1, IPC_CREAT | 0666)) { 
    if ( -1 == mSem ) {
        fprintf( stderr, "%s:%d: couldn't allocate semaphore.", __FILE__, __LINE__ );
    }
    semctl( mSem, 0, SETVAL, 1 );
}

WaitableEvent::WaitResult WaitableEvent::_wait( int msTimeout ) {
    if ( semctl( mSem, 0, GETVAL ) <= 0 ) {
        // In case we were already signaled while nobody was waiting.
        semctl( mSem, 0, SETVAL, 1 );
        return WR_SIGNALED;
    }
    timespec ts, *pts = NULL;
    if ( -1 != msTimeout ) {
        ts.tv_nsec = msTimeout % 1000 * 1000000;
        ts.tv_sec = msTimeout / 1000;
        pts = &ts;
    }
    uint64_t t1 = getTimeInMs();
    int r;
    sembuf sb[] = {{ 0, 0, 0 }, { 0, 1, IPC_NOWAIT }};
    #if defined (Darwin)
    // REVIEW: Can we do better?
    while ( 0 != ( r = semop( mSem, sb, 2 ) ) && EINTR == errno ) {
    #else
    while ( 0 != ( r = semtimedop( mSem, sb, 2, pts ) ) && EINTR == errno ) {
    #endif
        if ( getTimeInMs() - t1 > ( uint64_t )msTimeout ) {
            break;
        }
        pthread_yield();
    }
    return 0 == r ? WR_SIGNALED : WR_TIMEOUT;
}

void WaitableEvent::_signal() {
    if ( semctl( mSem, 0, GETVAL ) > 0 ) {
        sembuf sb[] = {{ 0, -1, 0 }};
        semop( mSem, sb, 1 );
    }
}
#endif

WaitableEvent::WaitResult WaitableEvent::wait( int msTimeout, TReasonsByOrg* pReasons ) {
    // Wait, and obtain the "reasons", i.e. what happened to trigger resolution of the wait.
    { MutexP const lLock( &mLockReasons ); mLastWaitTermination = 0; }
    WaitResult const wr = _wait( msTimeout );
    if ( pReasons ) {
        pReasons->clear();
        if ( WR_SIGNALED == wr ) {
            MutexP const lLock( &mLockReasons );
            *pReasons = mReasons;
            mReasons.clear();
        }
    } else {
        MutexP const lLock( &mLockReasons );
        mReasons.clear();
    }
    { MutexP const lLock( &mLockReasons ); mLastWaitTermination = getTimeInMs(); }
    return wr;
}

void WaitableEvent::signal( void* pOrg, TReasons const* pReasons ) {
    MutexP const lLock( &mLockReasons );
    _signal();
    if ( pReasons ) {
        char lOrg[64];
        snprintf( lOrg, sizeof(lOrg), "%x", ( size_t )pOrg );
        TReasonsByOrg::iterator iO = mReasons.find( lOrg );
        if ( mReasons.end() == iO ) {
            iO = mReasons.insert( TReasonsByOrg::value_type( lOrg, TReasons() ) ).first;
        }
        for ( TReasons::iterator i = pReasons->begin(); pReasons->end() != i; i++ ) {
            ( *iO ).second.insert( *i );
        }
    }
}

bool WaitableEvent::isStale() {
    MutexP const lLock( &mLockReasons );
    return ( 0 != mLastWaitTermination && getTimeInMs() > mLastWaitTermination + 20000 );
}

/**
 * MainNotificationHandler
 */
void MainNotificationHandler::notify( NotificationEvent *events,unsigned nEvents,uint64_t txid ) {
    // Safely grab a copy of clients.
    TClients lClients;
    { MutexP const lLock(&mLock); lClients = mClients; }
    // Dispatch outside of any lock.
    TClients::iterator iC;
    for ( iC = mClients.begin(); mClients.end() != iC; iC++ ) {
        (*iC)->notify( events, nEvents, txid );
    }
}

void MainNotificationHandler::replicationNotify( NotificationEvent*, unsigned, uint64_t ) { /* not needed for now */ }

void MainNotificationHandler::txNotify( TxEventType type,uint64_t txid ) {
    // Safely grab a copy of clients.
    TClients lClients;
    { MutexP const lLock(&mLock); lClients = mClients; }
    // Dispatch outside of any lock.
    TClients::iterator iC;
    for ( iC = mClients.begin(); mClients.end() != iC; iC++ ) {
        (*iC)->txNotify( type, txid );
    }
}

void MainNotificationHandler::registerClient( IStoreNotification* pClient ) {
    MutexP const lLock(&mLock);
    if ( mClients.end() != mClients.find(pClient) )
        return;
    mClients.insert( pClient );
}

void MainNotificationHandler::unregisterClient( IStoreNotification* pClient ) {
    MutexP const lLock(&mLock);
    TClients::iterator iC = mClients.find( pClient );
    if ( mClients.end() != iC ) {
        mClients.erase( iC );
    }
}

bool MainNotificationHandler::checkClient( IStoreNotification* pClient ) {
    MutexP const lLock(&mLock);
    return ( mClients.end() != mClients.find( pClient ) );
}

WaitableEvent* MainNotificationHandler::getGroupEvent( char const* clientid ) {
    if ( !clientid || 0 == strlen( clientid ) ) {
        return NULL;
    }
    MutexP const lLock(&mLock);
    if ( mGroupEvents.end() != mGroupEvents.find( clientid ) ) {
        return mGroupEvents[ clientid ];
    }
    return NULL;
}

WaitableEvent* MainNotificationHandler::allocGroupEvent( char const* clientid ) {
    if ( !clientid || 0 == strlen( clientid ) ) {
        return NULL;
    }
    MutexP const lLock(&mLock);
    TGroupEvents::iterator i = mGroupEvents.find( clientid );
    if ( mGroupEvents.end() == i ) {
        WaitableEvent* we = new WaitableEvent();
        i = mGroupEvents.insert( TGroupEvents::value_type( clientid, we ) ).first; // Note: The first reference is for mGroupEvents.
    }
    (*i).second->addRef(); // Note: The second reference is for the caller.
    (*i).second->incRegCount();
    return (*i).second;
}

void MainNotificationHandler::releaseGroupEvent( char const* clientid ) {
    if ( !clientid || 0 == strlen( clientid ) ) {
        return;
    }
    MutexP const lLock(&mLock);
    TGroupEvents::iterator i = mGroupEvents.find( clientid );
    if ( mGroupEvents.end() != i && 0 == (*i).second->decRegCount() ) {
        (*i).second->release();
        mGroupEvents.erase( i );
    }
}

/**
 * MvClientNotifHandler wraps together all the mechanisms required
 * to forward the requested notifications to a client, via the comet
 * networking pattern and via queries. This class provides the
 * following services:
 * . remember the notification criterion (which PIN, which class)
 *   and sift unwanted notifications
 * . provide a signaling mechanism to wake-up the comet handler
 *   upon notification
 * . handle "persistent notifications", i.e. a stored log model
 *   allowing clients to "catch-up" via queries (to be completed)
 */
class MvClientNotifHandler : public IStoreNotification {
protected:
    std::string mCriterionClassName; // If this is a class notification handler, the class name.
    std::string mClientid; // If this handler was associated with a group event, remember the id.
    ClassID mCriterionCLSID; // If this is a class notification handler, the class id.
    PID mCriterionPID; // If this is a pin notification handler, the pin id.
    long volatile mUseCount; // A refcount, to manage the lifetime of this object with respect to unregistrations and async callbacks.
    long volatile mTerminated; // Becomes 1 when the handler is unregistered.
protected:
    WaitableEvent mSynchroIndividual; // To signal wait requests specifically on this handler.
    WaitableEvent* mSynchroGroup; // To signal wait requests on the whole client process that generated this (and maybe other) handlers.
protected:
    typedef std::map<uint64_t, std::string> TTxStacks;
    typedef std::set<PID> TPIDs;
    TTxStacks mHitStacks; // To manage the transaction stack and notify only upon tx commit (n.b. this will be done by Affinity later on).
    TPIDs mReasons; // What caused the notifications; always expressed in terms of PIDs. Note: Currently in case of nested rollbacks, this will be inaccurate, but not in a dangerous way, and I don't want to invest too much effort on this considering Mark's upcoming changes.
    Mutex mLock;
public:
    MvClientNotifHandler( ISession& sess, WaitableEvent* synchrogroup, char const* className, PID const* pid, bool persistent, char const* pClientid = NULL )
        : mUseCount(1), mTerminated(0), mSynchroGroup(synchrogroup) {
        if ( pClientid ) { mClientid = pClientid; }
        // Store the notification criterion.
        mCriterionPID.ident = STORE_OWNER;
        mCriterionPID.pid = STORE_INVALID_PID;
        mCriterionCLSID = STORE_INVALID_CLASSID;
        if ( className ) {
            mCriterionClassName = className;
            if ( RC_OK != sess.getClassID( className, mCriterionCLSID ) || RC_OK != sess.enableClassNotifications( mCriterionCLSID, CLASS_NOTIFY_JOIN | CLASS_NOTIFY_LEAVE | CLASS_NOTIFY_CHANGE | CLASS_NOTIFY_DELETE | CLASS_NOTIFY_NEW ) ) {
                fprintf( stderr, "%s:%d: couldn't enable notifications on class '%s'", __FILE__, __LINE__, className );
            }
        }
        if ( pid ) {
            mCriterionPID = *pid;
        }
        // TODO: create persistent registration record, if not already there (will require session)
    }
    ~MvClientNotifHandler() { if ( mSynchroGroup ) { mSynchroGroup->release(); mSynchroGroup = NULL; } }
public:
    virtual void notify( NotificationEvent *events,unsigned nEvents,uint64_t txid ) {
        if ( mTerminated ) {
            return;
        }
        // Determine if this notification meets our criterion.
        TPIDs lReasons;
        unsigned i;
        for ( i = 0; i < nEvents; i++ ) {
            if ( STORE_INVALID_CLASSID != mCriterionCLSID ) {
                unsigned j;
                for ( j = 0; j < events[ i ].nEvents; j++ ) {
                    if ( events[ i ].events[ j ].cid == mCriterionCLSID ) {
                        lReasons.insert( events[ i ].pin );
                        // TODO: record a log entry (doing it here will guaranty that it's rolled back if necessary, will simplify final commit, and will allow consistent intra-tx queries). Or maybe will do async (session man)...
                    }
                }
            }  else if ( events[ i ].pin == mCriterionPID ) {
                lReasons.insert( events[ i ].pin );
                // TODO: record a log entry (doing it here will guaranty that it's rolled back if necessary, will simplify final commit, and will allow consistent intra-tx queries). Or maybe will do async (session man)...
                break;
            }
        }
        // If it does, mark the corresponding transaction stack with a '1'.
        // Note: We only notify upon top-level tx commit.
        if ( !lReasons.empty() ) {
            MutexP const lockStacks( &mLock );
            TTxStacks::iterator iHS = mHitStacks.find( txid );
            if ( mHitStacks.end() != iHS && ( *iHS ).second.length() > 0 ) {
                std::string & lHitStack = ( *iHS ).second;
                lHitStack[ lHitStack.length() - 1 ] = '1';
            }
            mReasons.insert( lReasons.begin(), lReasons.end() );
        }
    }
    virtual void replicationNotify( NotificationEvent*, unsigned, uint64_t ) { /* not needed for now */ }
    virtual void txNotify( TxEventType type, uint64_t txid ) {
        if ( mTerminated ) {
            return;
        }
        // Manage the transaction stacks, and determine if we're due to notify.
        bool hit = false;
        {
            MutexP const lockStacks( &mLock );
            TTxStacks::iterator iHS = mHitStacks.find( txid );
            if ( mHitStacks.end() == iHS ) {
                iHS = mHitStacks.insert( TTxStacks::value_type( txid, std::string() ) ).first;
            }
            std::string & lHitStack = ( *iHS ).second;
            switch ( type ) {
                case IStoreNotification::NTX_START:
                case IStoreNotification::NTX_SAVEPOINT:
                    lHitStack.push_back('0');
                    break;
                case IStoreNotification::NTX_COMMIT: {
                    size_t i;
                    for ( i = 0; i < lHitStack.length() && !hit; i++ ) {
                        hit = ( lHitStack[ i ] == '1' );
                    }
                    mHitStacks.erase( iHS );
                    break;
                }
                case IStoreNotification::NTX_ABORT:
                    mHitStacks.erase( iHS );
                    break;
                case IStoreNotification::NTX_COMMIT_SP:
                    if ( lHitStack.length() > 0 ) {
                        if ( lHitStack[ lHitStack.length() - 1 ] == '1' ) {
                            if ( lHitStack.length() >= 2 ) { 
                                lHitStack[ lHitStack.length() - 2 ] = '1';
                            } else {
                                hit = true;
                            }
                        }
                        if ( lHitStack.length() > 1 ) {
                            lHitStack.erase( lHitStack.length() - 1 );
                        } else {
                            mHitStacks.erase( iHS );
                        }
                    }
                    break;
                case IStoreNotification::NTX_ABORT_SP:
                    if ( lHitStack.length() > 1 ) {
                        lHitStack.erase( lHitStack.length() - 1 );
                    } else {
                        mHitStacks.erase( iHS );
                    }
                    break;
            }
        }
        if ( hit ) {
            signalAll();
        }
    }
public:
    void waitNotif( int timeout, WaitableEvent::TReasonsByOrg* pReasons /*todo: interruption mechanism, for process termination*/ ) {
        if ( mTerminated ) {
            return;
        }
        // Review: There might be instances where this implementation doesn't strictly respect timeout... could use an 'elapsed' value...
        addRef();
        while ( true /*todo: check interrupt*/ ) {
            WaitableEvent::WaitResult const lWR = mSynchroIndividual.wait( timeout > 0 ? timeout : -1, pReasons );
            if ( mTerminated || WaitableEvent::WR_TIMEOUT == lWR ) {
                release();
                return;
            } else if ( WaitableEvent::WR_SIGNALED == lWR ) {
                release();
                return;
            }
        }
        release();
    }
    void terminate() {
        InterlockedIncrement( &mTerminated );
        signalAll();
    }
    void getPersistentRegPIN( PID & pid ) {
        pid.ident = STORE_OWNER;
        pid.pid = STORE_INVALID_PID;
    }
public:
    void addRef() { InterlockedIncrement( &mUseCount ); }
    void release() { if ( 0 == InterlockedDecrement( &mUseCount ) ) { delete this; } }
    bool gcTest( MainNotificationHandler& pMainh )
    {
        // Note: Depends on pMainh's lock...
        // Note: Answering true here automatically has the effect of invoking the equivalent of unregisterClient...
        return ( !mTerminated && ( ( mSynchroGroup && mSynchroGroup->isStale() ) || mSynchroIndividual.isStale() ) );
    }
    void gc( MainNotificationHandler& pMainh )
    {
        if ( mTerminated ) {
            return;
        }
        terminate(); // Unblock any possible waiting request.
        pMainh.releaseGroupEvent( mClientid.c_str() ); // Decrement our refcount on the groupevent, if any specified.
        release(); // Release this client (n.b. may only be destroyed when all waiting requests are unblocked).
        // Note: It's in 'delete this' that the semaphores associated with mSynchroIndividual will be released.
    }
protected:
    void signalAll() {
        WaitableEvent::TReasons lReasons;
        grabReasons( lReasons );
        mSynchroIndividual.signal( this, &lReasons );
        signalGroup( lReasons );
    }
    void signalGroup( WaitableEvent::TReasons const& pReasons ) {
        if ( mSynchroGroup ) {
            mSynchroGroup->signal( this, &pReasons );
        }
    }
    void grabReasons( WaitableEvent::TReasons & pReasons ) {
        pReasons.clear();
        MutexP const lockStacks( &mLock );
        TPIDs::iterator i;
        for ( i = mReasons.begin(); mReasons.end() != i; i++ ) {
            char lReasonStr[ 1024 ], lReasonC[ 1024 ];
            lReasonC[ 0 ] = 0;
            if ( STORE_INVALID_CLASSID != mCriterionCLSID ) { snprintf( lReasonC, sizeof( lReasonC ), ", \"class_name\":\"%s\"", mCriterionClassName.c_str() ); }
            snprintf( lReasonStr, sizeof( lReasonStr ), "\"pid\":\""_LX_FM"\"%s", (*i).pid, lReasonC );
            pReasons.insert( lReasonStr );
        }
        mReasons.clear();
    }
public:
    static void produceWaitResponse( ISession& sess, WaitableEvent::TReasonsByOrg const& pReasons, char** res ) {
        std::stringstream os;
        os << "{";
        if ( pReasons.empty() ) {
            os << "\"timeout\":\"true\"";
        } else {
            WaitableEvent::TReasonsByOrg::const_iterator iO;
            for ( iO = pReasons.begin(); pReasons.end() != iO; ) {
                os << "\"" << std::hex << ( *iO ).first << "\":[";
                WaitableEvent::TReasons::iterator iR;
                WaitableEvent::TReasons const& lReasons = ( *iO ).second;
                for ( iR = lReasons.begin(); lReasons.end() != iR; ) {
                    os << "{" << ( *iR ) << "}";
                    iR++;
                    if ( lReasons.end() != iR ) {
                        os << ",";
                    }
                }
                os << "]";
                iO++;
                if ( pReasons.end() != iO ) {
                    os << ",";
                }
            }
        }
        os << "}" << std::endl;
        std::string const str = os.str();
        size_t const reslen = 1 + str.length();
        char* lres = ( char* )sess.alloc( reslen );
        memcpy( lres, str.c_str(), str.length() );
        lres[ reslen - 1 ] = 0;
        *res = lres;
    }
};

void MainNotificationHandler::gcClients() {
    TClients lGCable;
    TClients::iterator iC;
    {
        MutexP const lLock(&mLock);
        for ( iC = mClients.begin(); mClients.end() != iC; iC++ ) {
            if ( ( (MvClientNotifHandler *)(*iC) )->gcTest( *this ) ) {
                lGCable.insert( *iC );
                mClients.erase( *iC ); // Auto-unregister clients selected for gc, to get them out of the way (lock-wise).
            }
        }
    }
    for ( iC = lGCable.begin(); lGCable.end() != iC; iC++ ) {
        ( (MvClientNotifHandler *)(*iC) )->gc( *this );
    }
}

RC afy_regNotifi( MainNotificationHandler& mainh, ISession& sess, char const* type, char const* notifparam, char const* clientid, char** res, bool persistent ) {
    if ( res ) {
        *res = NULL;
    }
    mainh.gcClients(); // Get rid of any old stale client (i.e. that hasn't renewed its wait connection for more than x seconds).
    MvClientNotifHandler* handler = NULL;
    PID persistentReg;
    char lOutput[1024];
    lOutput[0] = 0;
    if ( 0 == strcmp( type, "class" ) ) {
        WaitableEvent* wegroup = mainh.allocGroupEvent( clientid );
        handler = new MvClientNotifHandler( sess, wegroup, notifparam, NULL, persistent, clientid );
        handler->getPersistentRegPIN( persistentReg );
        snprintf( lOutput, sizeof( lOutput ), "{\"%x\":\""_LX_FM"\"}", ( size_t )handler, persistentReg.pid );
    } else if ( 0 == strcmp( type, "pin" ) ) {
        PID lPID;
        lPID.ident = STORE_OWNER;
        lPID.pid = STORE_INVALID_PID;
        if ( 1 == sscanf( notifparam, _LX_FM, &lPID.pid ) ) {
            IPIN * const lPIN = sess.getPIN(lPID);
            if ( lPIN ) {
                if ( RC_OK != lPIN->setNotification() ) {
                    fprintf( stderr, "%s:%d: couldn't enable notifications on PIN "_LX_FM, __FILE__, __LINE__, lPID.pid );
                }
                lPIN->destroy();
            }
            WaitableEvent* wegroup = mainh.allocGroupEvent( clientid );
            handler = new MvClientNotifHandler( sess, wegroup, NULL, &lPID, persistent, clientid );
            handler->getPersistentRegPIN( persistentReg );
            snprintf( lOutput, sizeof( lOutput ), "{\"%x\":\""_LX_FM"\"}", ( size_t )handler, persistentReg.pid );
        }
    }
    if ( !handler ) {
        snprintf( lOutput, sizeof( lOutput ), "{}" );
    } else {
        mainh.registerClient( handler );
    }
    size_t const lResLen = strlen( lOutput );
    char* lres = ( char* )sess.alloc( 1 + lResLen );
    memcpy( lres, lOutput, lResLen );
    lres[ lResLen ] = 0;
    *res = lres;
    return RC_OK;
}

RC afy_unregNotifi( MainNotificationHandler& mainh, ISession& sess, char const* notifparam, char const* clientid, char**res ) {
    if ( res ) {
        *res = NULL;
    }
    void* handler;
    char const* response = "[]";
    char lOutput[1024];
    lOutput[0] = 0;
    if ( 1 == sscanf( notifparam, "%x", ( size_t* )&handler ) && mainh.checkClient( ( MvClientNotifHandler* )handler ) ) {
        MvClientNotifHandler* h = ( MvClientNotifHandler* )handler;
        h->terminate(); // Unblock any possible waiting request.
        mainh.unregisterClient( h ); // Unregister this client.
        mainh.releaseGroupEvent( clientid ); // Decrement our refcount on the groupevent, if any specified.
        h->release(); // Release this client (n.b. may only be destroyed when all waiting requests are unblocked).
        snprintf( lOutput, sizeof( lOutput ), "[\"%s\"]", notifparam );
        response = lOutput;
    }
    if ( response ) {
        size_t const lResLen = strlen( response );
        char* lres = ( char* )sess.alloc( 1 + lResLen );
        memcpy( lres, response, lResLen );
        lres[ lResLen ] = 0;
        *res = lres;
        return RC_OK;
    }
    return RC_OTHER;
}

RC afy_waitNotifi( MainNotificationHandler& mainh, ISession& sess, char const* notifparam, char const* clientid, int timeout, char**res ) {
    if ( res ) {
        *res = NULL;
    }
    mainh.gcClients(); // Get rid of any old stale client (i.e. that hasn't renewed its wait connection for more than x seconds).
    void* handler;
    WaitableEvent* wegroup = NULL;
    for (;;) {
        // If notifparam is specified, wait on that specific handler.
        if ( notifparam && 1 == sscanf( notifparam, "%x", ( size_t* )&handler ) && mainh.checkClient( ( MvClientNotifHandler* )handler ) ) {
            MvClientNotifHandler* h = ( MvClientNotifHandler* )handler;
            WaitableEvent::TReasonsByOrg lReasons;
            h->waitNotif( timeout, &lReasons );
            MvClientNotifHandler::produceWaitResponse( sess, lReasons, res );
            return RC_OK;
        // Otherwise, if clientid is specified, wait on the group handler (i.e. any notification to that clientid will do).
        } else if ( clientid && NULL != ( wegroup = mainh.getGroupEvent( clientid ) ) ) {
            // Wait on the whole group.
            wegroup->addRef();
            WaitableEvent::TReasonsByOrg lReasons;
            while ( true /*todo: check interrupt*/ ) {
                WaitableEvent::WaitResult const lWR = wegroup->wait( timeout > 0 ? timeout : -1, &lReasons );
                if ( WaitableEvent::WR_TIMEOUT == lWR ) {
                    break;
                } else if ( WaitableEvent::WR_SIGNALED == lWR ) {
                    break;
                }
            }
            MvClientNotifHandler::produceWaitResponse( sess, lReasons, res );
            wegroup->release();
            return RC_OK;
        }
        // In any other circumstance, produce a timeout.
        // Note: This could happen if, for example, a clientid request was received during client termination.
        char const* response = "{\"timeout\":\"true\"}";
        size_t const lResLen = strlen( response );
        char* lres = ( char* )sess.alloc( 1 + lResLen );
        memcpy( lres, response, lResLen );
        lres[ lResLen ] = 0;
        *res = lres;
        return RC_OK;
    }
    return RC_OTHER;
}
