import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { OwnerService } from 'src/app/_services/owner/owner.service';
import { GlobalConfig } from 'src/app/_shared/configs/global.config';
import { Owner } from 'src/app/domain/entities/owners/owner.model';

@Component({
  selector: 'app-owner-details',
  standalone: true,
  imports: [],
  templateUrl: './owner-details.component.html',
  styleUrl: './owner-details.component.scss'
})
export class OwnerDetailsComponent {

  @Input() key: string;
  @Output() contentUpdatedEvent = new EventEmitter();
  owner: Owner;

  isLoading$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  dateTimeFormat: string = GlobalConfig.DATE_TIME_FORMAT;

  constructor(private ownerService: OwnerService) { }

  ngOnInit(): void {
    this.getOwnerDetails(this.key);
  }

  getOwnerDetails(id: string): void {
    this.ownerService.getOwnerDetailsById(id).subscribe(response => {
      this.owner = response;
      this.refreshParentGrid();
      this.isLoading$.next(false);
    });
  }

  refreshParentGrid() {
    // emit the event contentUpdated inside a timeout statement with 0 ms 
    // to update the parent grid successfully
    setTimeout(() => {
      this.contentUpdatedEvent.emit("contentUpdated");
    }, 0);
  }

}
