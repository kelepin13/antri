import { Component, computed, input } from '@angular/core';

/** Tiny 24-bar chart of tickets per hour today. Empty hours show as a faint baseline. */
@Component({
  selector: 'app-hourly-bars',
  template: `
    <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" [attr.width]="width" [attr.height]="height" role="img"
         [attr.aria-label]="label()">
      @for (bar of bars(); track bar.hour) {
        <rect [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="barWidth" [attr.height]="bar.h"
              [class.empty]="bar.value === 0" rx="1">
          <title>{{ bar.hour }}:00 – {{ bar.value }} {{ bar.value === 1 ? 'ticket' : 'tickets' }}</title>
        </rect>
      }
    </svg>
  `,
  styles: `
    :host { display: inline-block; line-height: 0; }
    rect { fill: var(--ink); }
    rect.empty { fill: var(--line); }
  `,
})
export class HourlyBars {
  readonly values = input.required<number[]>();

  protected readonly width = 96;
  protected readonly height = 24;
  protected readonly barWidth = 3;

  protected readonly bars = computed(() => {
    const values = this.values();
    const max = Math.max(1, ...values);
    return values.map((value, hour) => {
      const h = value === 0 ? 1.5 : Math.max(3, (value / max) * this.height);
      return { hour, value, x: hour * 4, y: this.height - h, h };
    });
  });

  protected readonly label = computed(() => {
    const values = this.values();
    const total = values.reduce((a, b) => a + b, 0);
    if (total === 0) return 'No tickets yet today';
    const peak = values.indexOf(Math.max(...values));
    return `${total} tickets today, busiest around ${peak}:00`;
  });
}
