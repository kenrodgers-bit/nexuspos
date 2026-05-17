import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';

const events = ['click', 'keydown', 'touchstart', 'pointermove'];

export const useAutoLock = () => {
  const currentUser = useAppStore((state) => state.currentUser);
  const locked = useAppStore((state) => state.locked);
  const autoLockMinutes = useAppStore((state) => state.settings.autoLockMinutes);
  const lastActivityAt = useAppStore((state) => state.lastActivityAt);
  const touchActivity = useAppStore((state) => state.touchActivity);
  const lockSession = useAppStore((state) => state.lockSession);

  useEffect(() => {
    events.forEach((eventName) => window.addEventListener(eventName, touchActivity, { passive: true }));
    return () => events.forEach((eventName) => window.removeEventListener(eventName, touchActivity));
  }, [touchActivity]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!currentUser || locked) return;
      if (Date.now() - lastActivityAt > autoLockMinutes * 60_000) lockSession();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [autoLockMinutes, currentUser, lastActivityAt, lockSession, locked]);
};
