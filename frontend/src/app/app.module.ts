import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { CreateProjectModalComponent } from './components/create-project-modal/create-project-modal.component';
import { SaveTempProjectModalComponent } from './components/save-temp-project-modal/save-temp-project-modal.component';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    CreateProjectModalComponent,
    SaveTempProjectModalComponent
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
