/* -*- Mode: C; c-file-style: "stroustrup"; indent-tabs-mode:nil; -*- */

#if !defined( _storenotifier_h )
#define _storenotifier_h

#include <map>
#include <set>
#include <string>
#include <startup.h>
#ifdef WIN32
    #include <winsock2.h>
    #include <Windows.h>
#else
    #include <sys/ipc.h>
    #include <sys/sem.h>
    #define InterlockedIncrement(a) __sync_add_and_fetch(a,1)
    #define InterlockedDecrement(a) __sync_sub_and_fetch(a,1)
#endif
namespace MVStore { class ISession; };

/**
 * Mutex
 * Simple cross-platform threading abstraction.
 */
class Mutex
{
#ifdef WIN32
    CRITICAL_SECTION CS;
public:
    Mutex() { InitializeCriticalSection( &CS ); }
    ~Mutex() { DeleteCriticalSection( &CS ); }
    void lock() { EnterCriticalSection( &CS ); }
    bool trylock() { return TryEnterCriticalSection( &CS ) != 0; }
    void unlock() { LeaveCriticalSection( &CS ); }
#elif defined(POSIX)
    pthread_mutex_t mutex;
public:
    Mutex() {
        pthread_mutexattr_t lA;
        pthread_mutexattr_init( &lA );
        pthread_mutexattr_settype( &lA, PTHREAD_MUTEX_RECURSIVE );
        pthread_mutexattr_setpshared( &lA, PTHREAD_PROCESS_PRIVATE );
        pthread_mutex_init( &mutex, &lA );
    }
    ~Mutex() { pthread_mutex_destroy( &mutex ); }
    void lock() { pthread_mutex_lock( &mutex ); }
    bool trylock() { return pthread_mutex_trylock( &mutex ) == 0; }
    void unlock() { pthread_mutex_unlock( &mutex ); }
    operator pthread_mutex_t*() const { return const_cast<pthread_mutex_t*>( &mutex ); }
#endif
};
class MutexP
{
    Mutex *lock;
public:
    MutexP( Mutex *m=NULL ) : lock( m ) { if ( m != NULL ) m->lock(); }
    ~MutexP() { if ( lock != NULL ) lock->unlock(); }
    void set( Mutex *m ) { if ( lock != NULL ) lock->unlock(); if ( ( lock =m ) != NULL ) m->lock(); }
};

/**
 * WaitableEvent
 * Specialized cross-platform primitive allowing many 'producers' to signal a 'listener',
 * and provide additional data on the causes of the signal.  The listener can be focused on
 * a single producer (e.g. notifications on class X), or on multiple producers (e.g. all
 * notifications affecting client process Y).
 */
class WaitableEvent {
public:
    enum WaitResult { WR_SIGNALED, WR_TIMEOUT, WR_TERMINATED, WR_OTHER };
    typedef std::set<std::string> TReasons;
    typedef std::map<std::string, TReasons> TReasonsByOrg;
protected:
    long volatile mUseCount; // Refcount controlling the lifetime of this WaitableEvent.
    long mRegCount; // Registration count, to help MvStoreMgr::MainNotificationHandler track logical registrations.
    Mutex mLockReasons; // Mutex for mReasons.
    TReasonsByOrg mReasons; // Reasons why the event was signaled.
#ifdef WIN32
protected:
    HANDLE mEvent;
public:
    WaitableEvent() : mUseCount(1), mRegCount(0), mEvent( CreateEvent( NULL, FALSE, FALSE, NULL ) ) {}
    ~WaitableEvent() { CloseHandle( mEvent ); }
protected:
    WaitResult _wait( int msTimeout ) { return WAIT_OBJECT_0 == WaitForSingleObject( mEvent, msTimeout ) ? WR_SIGNALED : WR_TIMEOUT; }
    void _signal() { SetEvent( mEvent ); }
#else
protected:
    int mSem;
    static inline uint64_t getTimeInMs() { struct timespec ts; clock_gettime( CLOCK_REALTIME, &ts ); return ( uint64_t )ts.tv_sec * 1000 + ts.tv_nsec / 1000000; }
public:
    WaitableEvent();
    ~WaitableEvent() { semctl(mSem, 0, IPC_RMID); }
protected:
    WaitResult _wait( int msTimeout );
    void _signal();
#endif
public:
    void addRef() { InterlockedIncrement( &mUseCount ); }
    void release() { if ( 0 == InterlockedDecrement( &mUseCount ) ) { delete this; } }
    long incRegCount() { mRegCount++; return mRegCount; }
    long decRegCount() { mRegCount--; return mRegCount; }
    WaitResult wait( int msTimeout, TReasonsByOrg* pReasons=NULL );
    void signal( void* pOrg, TReasons const* pReasons );
};

/**
  * MainNotificationHandler handles all the notifications of one open store.
  * It accepts per-client registrations, and then dispatches incoming notifications
  * to all clients. This mechanism is required primarily because the store
  * itself only accepts one static notification handler.
  */
class MainNotificationHandler : public IStoreNotification {
protected:
    typedef std::set<IStoreNotification*> TClients;
    typedef std::map<std::string, WaitableEvent*> TGroupEvents;
protected:
    Mutex mLock;
    TClients mClients;
    TGroupEvents mGroupEvents;
public:
    // Review: Could decide to clear orphaned events in mClientEvents, in a destructor.
    virtual void notify( NotificationEvent *events,unsigned nEvents,uint64_t txid );
    virtual void replicationNotify( NotificationEvent*, unsigned, uint64_t );
    virtual void txNotify( TxEventType type,uint64_t txid );
public:
    void registerClient( IStoreNotification* pClient );
    void unregisterClient( IStoreNotification* pClient );
    bool checkClient( IStoreNotification* pClient );
public:
    WaitableEvent* getGroupEvent( char const* clientid );
    WaitableEvent* allocGroupEvent( char const* clientid );
    void releaseGroupEvent( char const* clientid );
};

RC mvs_regNotifi( MainNotificationHandler& mainh, MVStore::ISession& sess, char const* type, char const* notifparam, char const* clientid, char** res, bool persistent=true );
RC mvs_unregNotifi( MainNotificationHandler& mainh, MVStore::ISession& sess, char const* notifparam, char const* clientid, char**res );
RC mvs_waitNotifi( MainNotificationHandler& mainh, MVStore::ISession& sess, char const* notifparam, char const* clientid, int timeout, char**res );

#endif
