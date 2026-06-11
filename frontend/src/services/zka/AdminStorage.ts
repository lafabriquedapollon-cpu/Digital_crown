import localforage from 'localforage';
import { api } from '../api';

localforage.config({
  driver: localforage.INDEXEDDB,
  name: 'digital-crown-admin',
  version: 1.0,
  storeName: 'admin_store',
});

export interface QueuedAction {
  id: string;
  url: string;
  method: string;
  body?: any;
  timestamp: number;
}

export const AdminStorage = {
  async setItem(key: string, value: any): Promise<void> {
    await localforage.setItem(key, value);
  },

  async getItem<T>(key: string, defaultValue: T): Promise<T> {
    const value = await localforage.getItem<T>(key);
    return value !== null ? value : defaultValue;
  },

  async removeItem(key: string): Promise<void> {
    await localforage.removeItem(key);
  },

  // --- OFFLINE ACTION QUEUE ---
  async enqueueAction(url: string, method: string, body?: any): Promise<void> {
    const queue = await this.getActionQueue();
    const action: QueuedAction = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      url, method, body, timestamp: Date.now()
    };
    queue.push(action);
    await localforage.setItem('admin_action_queue', queue);
  },

  async getActionQueue(): Promise<QueuedAction[]> {
    const queue = await localforage.getItem<QueuedAction[]>('admin_action_queue');
    return queue || [];
  },

  async removeActionFromQueue(id: string): Promise<void> {
    const queue = await this.getActionQueue();
    const filtered = queue.filter(a => a.id !== id);
    await localforage.setItem('admin_action_queue', filtered);
  },

  async syncQueue(): Promise<void> {
    const queue = await this.getActionQueue();
    if (queue.length === 0) return;

    // Execute actions sequentially
    for (const action of queue) {
      try {
        if (action.method === 'PUT') {
          await api.put(action.url, action.body);
        } else if (action.method === 'POST') {
          await api.post(action.url, action.body);
        } else if (action.method === 'DELETE') {
          await api.delete(action.url);
        }
        await this.removeActionFromQueue(action.id);
      } catch (err: any) {
        // If network error, stop syncing and retry later
        if (!err.response) {
          console.warn('Network error during sync, will retry later.');
          break;
        } else if (err.response.status >= 500) {
          // Server error, try again later
          break;
        } else {
          // Client error (400), probably bad data, remove from queue to avoid block
          await this.removeActionFromQueue(action.id);
        }
      }
    }
  }
};
