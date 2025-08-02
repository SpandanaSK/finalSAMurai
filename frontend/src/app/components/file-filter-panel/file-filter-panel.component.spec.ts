import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FileFilterPanelComponent } from './file-filter-panel.component';

describe('FileFilterPanelComponent', () => {
  let component: FileFilterPanelComponent;
  let fixture: ComponentFixture<FileFilterPanelComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FileFilterPanelComponent]
    });
    fixture = TestBed.createComponent(FileFilterPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
