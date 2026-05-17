import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';

export const useOnlineStatus = () => {
  const online = useAppStore((state) => state.online);
  const setOnline = useAppStore((state) => state.setOnline);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [setOnline]);

  return online;
};
