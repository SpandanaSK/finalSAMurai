import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { CreateProjectModalComponent } from './components/create-project-modal/create-project-modal.component';
import { SaveTempProjectModalComponent } from './components/save-temp-project-modal/save-temp-project-modal.component';
import { UploadButtonComponent } from './components/upload-button/upload-button.component';

@NgModule({
  declarations: [
    AppComponent,
  
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    CreateProjectModalComponent,
    SaveTempProjectModalComponent,
    UploadButtonComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
