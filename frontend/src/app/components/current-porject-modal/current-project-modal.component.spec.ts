import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CurrentProjectModalComponent } from './current-project-modal.component';

describe('CurrentProjectModalComponent', () => {
  let component: CurrentProjectModalComponent;
  let fixture: ComponentFixture<CurrentProjectModalComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CurrentProjectModalComponent]
    });
    fixture = TestBed.createComponent(CurrentProjectModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
