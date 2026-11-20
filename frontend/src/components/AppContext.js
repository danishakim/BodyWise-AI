// Shared app services for every screen: server status, navigation, toasts,
// the meal-logged overlay, metrics refresh and the PWA install prompt.
import { createContext, useContext } from 'react';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
