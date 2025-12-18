import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class BranchService {
  private branchSubject = new BehaviorSubject<string>(
    localStorage.getItem('branch') || 'All Branches'
  );

  // Observable stream that components can subscribe to for branch changes
  branch$ = this.branchSubject.asObservable();

  get currentBranch(): string {
    return this.branchSubject.value;
  }

  setBranch(branch: string): void {
    if (branch === this.branchSubject.value) {
      return;
    }
    this.branchSubject.next(branch);
    localStorage.setItem('branch', branch);
  }
}
