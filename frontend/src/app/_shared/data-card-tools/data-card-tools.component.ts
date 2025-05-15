import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, Input, OnInit } from '@angular/core';
import KTCard from '../../../assets/js/components/card';

@Component({
  selector: 'app-data-card-tools',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './data-card-tools.component.html',
  styleUrl: './data-card-tools.component.scss'
})
export class DataCardToolsComponent  implements OnInit, AfterViewInit {
  @Input() cardTitle = "";
  @Input() cardId = "";
  @Input() hideToogle = false; // toogle is defaulted to visible, but can be hidden if setting this flag to false
  @Input() toogleTitle = "Toogle Card";
  @Input() cardCount: number = undefined;
  @Input() cardTotal: number = undefined;
  @Input() cardLabelClass: string = "";
  
  constructor() { }

  ngAfterViewInit(): void {
    new KTCard(this.cardId);
  }

  ngOnInit(): void {
  }

}
