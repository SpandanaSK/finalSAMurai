import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AttributesComponent } from './attributes.component';

describe('AttributesComponent', () => {
  let component: AttributesComponent;
  let fixture: ComponentFixture<AttributesComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AttributesComponent]
    });
    fixture = TestBed.createComponent(AttributesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
