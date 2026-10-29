import { TestBed } from '@angular/core/testing';
import { HourlyBars } from './hourly-bars';

describe('HourlyBars', () => {
  it('draws 24 bars and describes the busiest hour', async () => {
    const fixture = TestBed.createComponent(HourlyBars);
    const values = Array.from({ length: 24 }, (_, h) => (h === 9 ? 6 : h === 10 ? 3 : 0));
    fixture.componentRef.setInput('values', values);
    await fixture.whenStable();

    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.querySelectorAll('rect')).toHaveLength(24);
    expect(svg.querySelectorAll('rect.empty')).toHaveLength(22);
    expect(svg.getAttribute('aria-label')).toBe('9 tickets today, busiest around 9:00');
  });
});
