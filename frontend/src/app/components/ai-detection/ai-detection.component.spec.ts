import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AiDetectionComponent } from './ai-detection.component';

describe('AiDetectionComponent', () => {
  let component: AiDetectionComponent;
  let fixture: ComponentFixture<AiDetectionComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AiDetectionComponent]
    });
    fixture = TestBed.createComponent(AiDetectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
