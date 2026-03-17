import { Component, inject, OnDestroy, effect } from '@angular/core';
import { JarvisStore } from './jarvis.store';
import { VoiceService } from '../../core/voice.service';
import { ConversationService } from '../../core/conversation.service';

@Component({
  selector: 'app-jarvis',
  standalone: true,
  templateUrl: './jarvis.component.html',
  styleUrl: './jarvis.component.css',
  providers: [JarvisStore],
})
export class JarvisComponent implements OnDestroy {
  protected readonly store = inject(JarvisStore);
  protected readonly voice = inject(VoiceService);
  protected readonly conversation = inject(ConversationService);

  constructor() {
    this.voice.onListeningChange((listening) => {
      if (listening) this.store.startListening();
      else this.store.stopListening();
    });
    effect(() => {
      const on = this.store.isJarvisOn();
      if (on) {
        void this.voice.startListening();
      } else {
        void this.voice.stopListening();
        this.store.stopListening();
      }
    });
  }

  ngOnDestroy(): void {
    void this.voice.stopListening();
    this.store.stopListening();
    this.store.isJarvisOn.set(false);
  }

  protected toggle(): void {
    this.store.toggleJarvis();
  }
}
