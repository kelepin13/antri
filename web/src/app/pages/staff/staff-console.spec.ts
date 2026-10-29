import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { LiveQueue } from '../../core/live';
import { StaffQueue } from '../../core/models';
import { StaffConsolePage } from './staff-console';

const queue: StaffQueue = {
  venue: {
    id: 'v1',
    name: 'Klinik Sehat Bersama',
    category: 'Clinic',
    address: 'Jl. Melati 12',
    isOpen: true,
    waitingCount: 2,
    lastIssuedNumber: 7,
    nowServing: [{ number: 5, counter: 'Counter 1' }],
    avgServiceMinutes: 8,
    estimatedWaitMinutes: 16,
    updatedAt: new Date().toISOString(),
  },
  called: [{ id: 't5', number: 5, counter: 'Counter 1', customerName: 'Rizky', createdAt: new Date().toISOString(), calledAt: new Date().toISOString() }],
  waiting: [
    { id: 't6', number: 6, counter: null, customerName: 'Ayu', createdAt: new Date().toISOString(), calledAt: null },
    { id: 't7', number: 7, counter: null, customerName: 'Fajar', createdAt: new Date().toISOString(), calledAt: null },
  ],
};

describe('StaffConsolePage', () => {
  let api: { staffQueue: ReturnType<typeof vi.fn>; callNext: ReturnType<typeof vi.fn>; finish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    api = {
      staffQueue: vi.fn().mockResolvedValue(queue),
      callNext: vi.fn().mockResolvedValue({ ticket: { id: 't6', number: 6, status: 'CALLED', counter: 'Counter 1' }, completedTicketIds: ['t5'] }),
      finish: vi.fn().mockResolvedValue({}),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Api, useValue: api },
        { provide: LiveQueue, useValue: { watch: () => NEVER, onConnectionChange: () => () => undefined } },
        {
          provide: Auth,
          useValue: { user: () => ({ id: 's', email: 's@x', name: 'Staff', role: 'STAFF', venueId: 'v1' }), logout: vi.fn() },
        },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(StaffConsolePage);
    fixture.autoDetectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // The queue loads asynchronously; wait until the console has rendered it.
    await vi.waitFor(() => expect(el.querySelector('.counter-picker')).toBeTruthy());
    await fixture.whenStable();
    return el;
  }

  it("shows who is at this counter and who is waiting", async () => {
    const el = await render();
    expect(el.querySelector('.serving-number')?.textContent?.trim()).toBe('5');
    expect(el.querySelector('.serving-name')?.textContent).toContain('Rizky');
    expect(el.querySelectorAll('ol li')).toHaveLength(2);
    expect(el.querySelector('ol li.next')?.textContent).toContain('Ayu');
  });

  it('calls the next customer with the N key, to the chosen counter', async () => {
    await render();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    await vi.waitFor(() => expect(api.callNext).toHaveBeenCalledWith('Counter 1'));
  });

  it('marks the current customer served with S, but not while typing in a field', async () => {
    const el = await render();
    const input = document.createElement('input');
    el.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
    expect(api.finish).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    await vi.waitFor(() => expect(api.finish).toHaveBeenCalledWith('t5', 'SERVED'));
  });

  it('remembers which counter this screen belongs to', async () => {
    const el = await render();
    const counter2 = [...el.querySelectorAll<HTMLButtonElement>('.counter-picker button')].find((b) => b.textContent?.includes('Counter 2'))!;
    counter2.click();
    expect(localStorage.getItem('antri.counter')).toBe('Counter 2');
  });
});
