import { Component, OnDestroy, OnInit} from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { SharedModule } from '../shared/shared.module';
import { AuthService } from 'src/app/_services/services.index';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { ReSellerService } from 'src/app/_services/reseller/reseller.service';
import { EditResellerDetailsComponent } from './edit-reseller-details/edit-reseller-details.component';
import { ReSeller } from 'src/app/domain/resellers/reseller.model';

@Component({
  selector: 'app-resellers',
  standalone: true,
  imports: [SharedModule, TranslateModule, EditResellerDetailsComponent, RouterModule, MatMenuModule, MatIconModule],
  templateUrl: './resellers.component.html',
  styleUrl: './resellers.component.scss'
})
export class ResellersComponent implements OnInit, OnDestroy {

  reSellers$: BehaviorSubject<ReSeller[]> = new BehaviorSubject<ReSeller[]>([]);

  constructor(private translate: TranslateService, private router: Router, private reSellerService: ReSellerService) {
  }

  ngOnInit(): void {
    this.loadReSellers();
  }

  ngOnDestroy() {
    // also unsubscribe all Angular Subscriptions
  }

  loadReSellers() {
    this.reSellerService.getReSellers().subscribe(response => {
      if (response && response.succeeded) {
        this.reSellers$.next(response.data);
      }
    });
  }

  openEditReSeller(reSeller: ReSeller) {

  }

  deleteReSeller(reSeller: ReSeller) {

  }

  activateReSeller(reSeller: ReSeller) {

  }

  approveReSeller(reSeller: ReSeller) {

  }

  getReSellerBackgroundColor(reSeller: ReSeller) {
    return !reSeller.isActive ? "deactive-reSeller" : "";
  }

  openCreateReSellerModal() {
    this.router.navigateByUrl("/admin/resellers/create");
  }

  getTranslation(key: string, param: string = null): Observable<string> {
    return this.translate.get(key, { value: param });
  }
}
