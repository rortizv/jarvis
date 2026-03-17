import { signal, computed } from '@angular/core';

export class JarvisStore {
  readonly isJarvisOn = signal<boolean>(false);
  readonly isListening = signal<boolean>(false);

  readonly isMicActive = computed(() => this.isJarvisOn() && this.isListening());

  toggleJarvis(): void {
    this.isJarvisOn.update((v) => !v);
  }

  startListening(): void {
    this.isListening.set(true);
  }

  stopListening(): void {
    this.isListening.set(false);
  }
}
