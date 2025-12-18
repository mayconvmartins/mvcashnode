'use client';

import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';
import { 
  isWebPushSupported, 
  registerServiceWorker, 
  subscribeToWebPush,
  unsubscribeFromWebPush,
  isSubscribedToWebPush,
  getNotificationPermission,
  requestNotificationPermission,
} from '@/lib/utils/webpush';

interface WebPushContextType {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission;
  isLoading: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  requestPermission: () => Promise<NotificationPermission>;
}

const WebPushContext = createContext<WebPushContextType>({
  isSupported: false,
  isSubscribed: false,
  permission: 'default',
  isLoading: true,
  subscribe: async () => false,
  unsubscribe: async () => false,
  requestPermission: async () => 'default',
});

export function useWebPush() {
  return useContext(WebPushContext);
}

export function WebPushProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState(true);

  // Inicializar Service Worker e verificar status
  useEffect(() => {
    const init = async () => {
      if (typeof window === 'undefined') return;

      // Verificar suporte
      const supported = isWebPushSupported();
      setIsSupported(supported);

      if (!supported) {
        setIsLoading(false);
        return;
      }

      // Verificar permissão
      const perm = getNotificationPermission();
      setPermission(perm);

      // Registrar Service Worker
      await registerServiceWorker();

      // Verificar se já está inscrito
      const subscribed = await isSubscribedToWebPush();
      setIsSubscribed(subscribed);

      setIsLoading(false);
    };

    init();
  }, []);

  // Auto-subscribe quando usuário está autenticado e já tem permissão
  useEffect(() => {
    const autoSubscribe = async () => {
      if (isAuthenticated && isSupported && permission === 'granted' && !isSubscribed && !isLoading) {
        console.log('[WebPush] Auto-subscribing...');
        const success = await subscribeToWebPush();
        if (success) {
          setIsSubscribed(true);
        }
      }
    };

    autoSubscribe();
  }, [isAuthenticated, isSupported, permission, isSubscribed, isLoading]);

  const subscribe = useCallback(async () => {
    if (!isSupported) return false;
    
    setIsLoading(true);
    try {
      const success = await subscribeToWebPush();
      if (success) {
        setIsSubscribed(true);
        setPermission('granted');
      }
      return success;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return false;
    
    setIsLoading(true);
    try {
      const success = await unsubscribeFromWebPush();
      if (success) {
        setIsSubscribed(false);
      }
      return success;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const requestPermissionCallback = useCallback(async () => {
    const perm = await requestNotificationPermission();
    setPermission(perm);
    return perm;
  }, []);

  return (
    <WebPushContext.Provider
      value={{
        isSupported,
        isSubscribed,
        permission,
        isLoading,
        subscribe,
        unsubscribe,
        requestPermission: requestPermissionCallback,
      }}
    >
      {children}
    </WebPushContext.Provider>
  );
}

