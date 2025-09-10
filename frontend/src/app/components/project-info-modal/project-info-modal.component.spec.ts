import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectInfoModalComponent } from './project-info-modal.component';

describe('ProjectInfoModalComponent', () => {
  let component: ProjectInfoModalComponent;
  let fixture: ComponentFixture<ProjectInfoModalComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProjectInfoModalComponent]
    });
    fixture = TestBed.createComponent(ProjectInfoModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
