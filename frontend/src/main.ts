import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideHttpClient } from '@angular/common/http'; // <-- Add this import
import 'zone.js';

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient()] // <-- Add this line
}).catch(err => console.error(err));