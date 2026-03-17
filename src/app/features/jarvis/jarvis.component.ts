import { Component, inject, OnDestroy, effect } from '@angular/core';
import { JarvisStore } from './jarvis.store';
import { VoiceService } from '../../core/voice.service';

@Component({
  selector: 'app-jarvis',
  standalone: true,
  templateUrl: './jarvis.component.html',
  styleUrl: './jarvis.component.css',
  providers: [JarvisStore],
})
export class JarvisComponent implements OnDestroy {
  protected readonly store = inject(JarvisStore);
  private readonly voice = inject(VoiceService);

  constructor() {
    this.voice.onListeningChange((listening) => {
      if (listening) this.store.startListening();
      else this.store.stopListening();
    });
    effect(() => {
      const on = this.store.isJarvisOn();
      if (on) {
        this.voice.startListening();
      } else {
        this.voice.stopListening();
        this.store.stopListening();
      }
    });
  }

  ngOnDestroy(): void {
    this.voice.stopListening();
    this.store.stopListening();
    this.store.isJarvisOn.set(false);
  }

  protected toggle(): void {
    this.store.toggleJarvis();
  }
}
