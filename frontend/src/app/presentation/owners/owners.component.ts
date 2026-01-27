import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, catchError, Observable, Subscription } from 'rxjs';
import { Owner } from 'src/app/domain/entities/owners/owner.model';
import { SharedModule } from '../shared/shared.module';
import { AuthService } from 'src/app/_services/services.index';
import { OwnerDetailsComponent } from './owner-details/owner-details.component';
// import {
//   Column,
//   ContextMenu,
//   ExtensionName,
//   FieldType,
//   Filters,
//   Formatter,
//   GridOption,
//   Formatters,
//   AngularGridInstance,
//   AngularSlickgridModule,
//   unsubscribeAllObservables
// } from 'angular-slickgrid';
// import { actionFormatter } from 'src/app/_shared/formatters/action.formatter';
// import { booleanFormatter } from 'src/app/_shared/formatters/boolean.formatter';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { OwnerService } from 'src/app/_services/owner/owner.service';


@Component({
    selector: 'app-owners',
    imports: [SharedModule, TranslateModule, OwnerDetailsComponent, RouterModule, MatMenuModule, MatIconModule,
        // AngularSlickgridModule
    ],
    templateUrl: './owners.component.html',
    styleUrl: './owners.component.scss'
})
export class OwnersComponent implements OnInit, OnDestroy {

  owners$: BehaviorSubject<Owner[]> = new BehaviorSubject<Owner[]>([]);

  private _darkModeGrid = false;
  private subscriptions: Subscription[] = [];
  // angularGrid!: AngularGridInstance;
  // columnDefinitions: Column[] = [];
  // gridOptions!: GridOption;


  constructor(private authService: AuthService, private translate: TranslateService, 
    private modalService: NgbModal, private router: Router, private ownerService: OwnerService) {
  }

  ngOnInit(): void {
    // this.prepareGrid();
    this.loadOwners();
  }

  ngOnDestroy() {
    // also unsubscribe all Angular Subscriptions
    // unsubscribeAllObservables(this.subscriptions);
  }

  // angularGridReady(angularGrid: AngularGridInstance) {
  //   this.angularGrid = angularGrid;
  // }

  isBrowserDarkModeEnabled() {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  // get cellMenuInstance() {
  //   return this.angularGrid?.extensionService?.getExtensionInstanceByName(ExtensionName.cellMenu);
  // }

  // get contextMenuInstance() {
  //   return this.angularGrid?.extensionService?.getExtensionInstanceByName(ExtensionName.contextMenu);
  // }

  // prepareGrid() {
  //   this.columnDefinitions = [
  //     {
  //       id: 'fullName',
  //       name: this.translate.instant('USER.FULL_NAME'),
  //       field: 'fullName',
  //       sortable: true, filterable: true,
  //     },
  //     {
  //       id: 'email',
  //       name: this.translate.instant('GENERAL.EMAIL'),
  //       field: 'email',
  //       sortable: true, filterable: true,
  //     },
  //     {
  //       id: 'cellPhone',
  //       name: this.translate.instant('GENERAL.CELL_PHONE'),
  //       field: 'cellPhone',
  //       sortable: true, filterable: true,
  //     },
  //     {
  //       id: 'guest',
  //       name: this.translate.instant('GENERAL.GUEST'),
  //       field: 'guest',
  //       formatter: booleanFormatter(this.translate),
  //       sortable: true,
  //       filterable: true,
  //       filter: {
  //         collection: [
  //           {
  //             value: '',
  //             label: ''
  //           }, {
  //             value: true,
  //             labelKey: this.translate.instant('GENERAL.YES')
  //           },
  //           {
  //             value: false,
  //             labelKey: this.translate.instant('GENERAL.NO')
  //           }
  //         ],
  //         model: Filters['singleSelect'],
  //         enableTranslateLabel: true,
  //       }
  //     },
  //     {
  //       id: 'createdDate',
  //       name: this.translate.instant('GENERAL.CREATED_DATE'),
  //       field: 'createdDate',
  //       formatter: Formatters['dateEuro'], outputType: FieldType.dateEuro, type: FieldType.date,
  //       sortable: true,
  //       filterable: true, filter: { model: Filters["compoundDate"] }
  //     },
  //     {
  //       id: 'isActive',
  //       name: this.translate.instant('GENERAL.ACTIVE'),
  //       field: 'isActive',
  //       formatter: booleanFormatter(this.translate),
  //       sortable: true,
  //       filterable: true,
  //       filter: {
  //         collection: [
  //           {
  //             value: '',
  //             label: ''
  //           }, {
  //             value: true,
  //             labelKey: this.translate.instant('GENERAL.YES')
  //           },
  //           {
  //             value: false,
  //             labelKey: this.translate.instant('GENERAL.NO')
  //           }
  //         ],
  //         model: Filters['singleSelect'],
  //         enableTranslateLabel: true,
  //       }
  //     },
  //     {
  //       id: 'action',
  //       field: 'action',
  //       name: '',
  //       formatter: actionFormatter,
  //       excludeFromExport: true,
  //       cellMenu: {
  //         //commandTitle: 'Commands', // optional title
  //         onCommand: (e, args) => this.commandHandler(args.command, args.dataContext),
  //         commandItems: [
  //           {
  //             command: 'details', iconCssClass: 'mi mi-details yellow', cssClass: 'yellow', textCssClass: 'yellow',
  //             title: this.translate.instant('LIST_ACTION_BUTTON.DETAILS'),
  //             // you can use the "action" callback and/or use "onCommand" callback from the grid options, they both have the same arguments
  //             // action: (e, args) => {
  //             //   console.log(args.dataContext, args.column); // action callback.. do something
  //             // }
  //           },
  //           {
  //             command: 'edit', iconCssClass: 'mi mi-edit',
  //             title: this.translate.instant('LIST_ACTION_BUTTON.EDIT'),
  //           },
  //           {
  //             command: 'delete', iconCssClass: 'mi mi-delete',
  //             title: this.translate.instant('LIST_ACTION_BUTTON.DELETE'),
  //           },
  //           // you can add sub-menus by adding nested `commandItems`
  //         ],
  //       }
  //     },
  //   ];
  //   this._darkModeGrid = this.isBrowserDarkModeEnabled();
  //   this.gridOptions = {
  //     darkMode: this._darkModeGrid,
  //     enableAutoResize: true,
  //     enableSorting: true,
  //     //gridHeight: 225,
  //     gridWidth: "100%",
  //     enableFiltering: true,

  //     autoFitColumnsOnFirstLoad: false,
  //     enableAutoSizeColumns: false,
  //     // then enable resize by content with these 2 flags
  //     autosizeColumnsByCellContentOnFirstLoad: true,
  //     enableAutoResizeColumnsByCellContent: true,

  //     enableCellMenu: true,
  //     enablePagination: true,
  //     pagination: {
  //       pageSizes: [5, 10, 20, 25, 50],
  //       pageSize: 20,
  //     },

  //   };
  // }

  // commandHandler(command: string, dataContext: Owner) {
  //   switch (command) {
  //     case 'details':
  //       break;
  //     case 'edit':
  //       break;
  //     case 'delete':
  //       break;
  //   }
  // }

  loadOwners() {
    this.ownerService.getOwners().subscribe(response => {
      if (response && response.succeeded) {
        this.owners$.next(response.data);
      }
    });
    // this.owners$.next([
    //   {
    //     id: "1",
    //     userId: "1",
    //     fullName: "Lizardo Felipe Romero Scott",
    //     cellPhone: "5352432968",
    //     email: "lrscott83@gmail.com",
    //     description: "Esto es una descripcion larga bien larga y jhsdjhj asdjf njknd fkn adsfjknkjn inadsf jkna dkjfsnkjnkjn akjdfn iansdf inadsfoin oiadsnfoi naoidsf noiunadioufs niouandsfio noiuadns fioun aoidsnf ioands finads fin iadnsf iandf iandf inadfi ",
    //     guest: true,
    //     isActive: true,
    //     createdDate: new Date(),
    //     //createdByName: this.authService.currentUserValue.login,
    //     createdByName: 'Lizardo Romero Scott',
    //     updatedDate: undefined,
    //     updatedByName: undefined,
    //   },
    //   {
    //     id: "2",
    //     userId: "1",
    //     fullName: "Lizardo Felipe Romero Scott",
    //     cellPhone: "5352432968",
    //     email: "lrscott83@gmail.com",
    //     description: "Esto es una descripcion corta",
    //     guest: true,
    //     isActive: false,
    //     createdDate: new Date(),
    //     createdByName: 'Lizardo Romero Scott',
    //     updatedDate: undefined,
    //     updatedByName: undefined,
    //   },
    //   {
    //     id: "3",
    //     userId: "1",
    //     fullName: "Lizardo Felipe Romero Scott",
    //     cellPhone: "5352432968",
    //     email: "lrscott83@gmail.com",
    //     description: "Esto es una descripcion larga bien larga y jhsdjhj asdjf njknd fkn adsfjknkjn inadsf jkna ",
    //     guest: false,
    //     isActive: true,
    //     createdDate: new Date(),
    //     createdByName: 'Lizardo Romero Scott',
    //     updatedDate: undefined,
    //     updatedByName: undefined,
    //   },
    //   {
    //     id: "4",
    //     userId: "1",
    //     fullName: "Lizardo Felipe Romero Scott",
    //     cellPhone: "5352432968",
    //     email: "lrscott83@gmail.com",
    //     description: "Esto es una descripcion corta",
    //     guest: false,
    //     isActive: false,
    //     createdDate: new Date(),
    //     createdByName: 'Lizardo Romero Scott',
    //     updatedDate: undefined,
    //     updatedByName: undefined,
    //   },
    //   {
    //     id: "5",
    //     userId: "1",
    //     fullName: "Lizardo Felipe Romero Scott",
    //     cellPhone: "5352432968",
    //     email: "lrscott83@gmail.com",
    //     description: "Esto es una descripcion larga bien larga y jhsdjhj asdjf njknd fkn adsfjknkjn inadsf jkna dkjfsnkjnkjn akjdfn iansdf inadsfoin oiadsnfoi naoidsf noiunadioufs niouandsfio noiuadns fioun aoidsnf ioands finads fin iadnsf iandf iandf inadfi ",
    //     guest: true,
    //     isActive: true,
    //     createdDate: new Date(),
    //     createdByName: 'Lizardo Romero Scott',
    //     updatedDate: undefined,
    //     updatedByName: undefined,
    //   },
    //   {
    //     id: "6",
    //     userId: "1",
    //     fullName: "Lizardo Felipe Romero Scott",
    //     cellPhone: "5352432968",
    //     email: "lrscott83@gmail.com",
    //     description: "Esto es una descripcion corta",
    //     guest: true,
    //     isActive: true,
    //     createdDate: new Date(),
    //     createdByName: 'Lizardo Romero Scott',
    //     updatedDate: undefined,
    //     updatedByName: undefined,
    //   },
    //   {
    //     id: "7",
    //     userId: "1",
    //     fullName: "Lizardo Felipe Romero Scott",
    //     cellPhone: "5352432968",
    //     email: "lrscott83@gmail.com",
    //     description: "Esto es una descripcion larga bien larga y jhsdjhj asdjf njknd fkn adsfjknkjn inadsf jkna dkjfsnkjnkjn akjdfn iansdf inadsfoin oiadsnfoi naoidsf noiunadioufs niouandsfio noiuadns fioun aoidsnf ioands finads fin iadnsf iandf iandf inadfi ",
    //     guest: true,
    //     isActive: true,
    //     createdDate: new Date(),
    //     createdByName: 'Lizardo Romero Scott',
    //     updatedDate: undefined,
    //     updatedByName: undefined,
    //   }
    // ]);
  }

  openEditOwner(owner: Owner) {

  }

  deleteOwner(owner: Owner) {
    this.ownerService.deleteOwner(owner.id).subscribe(response => {
      if (response && response.succeeded) {
        this.loadOwners();
      }
    });
  }

  activateOwner(owner: Owner) {

  }

  deactivateOwner(owner: Owner) {

  }

  approveOwner(owner: Owner) {

  }

  getOwnerBackgroundColor(owner: Owner) {
    return !owner.isActive ? "deactive-owner" : (!owner.approved ? "guest-owner" : "");
  }

  getOwnerStorePrice(owner: Owner): number {
    return owner.storeModules.reduce((acc, module) => acc + module.storeModuleTotalCurrentPrice, 0);
  }

  getOwnerStoreCountText(owner: Owner): string {
    const count: number = owner.storeModules.length;
    if (count <= 1)
      return this.translate.instant('OWNER.STORE_SINGLE_PRICE', {count: count});
    return this.translate.instant('OWNER.STORE_SINGLE_PRICE', {count: count});
  }

  openCreateOwnerModal() {
    this.router.navigateByUrl("/admin/owners/create");
  }

  getTranslation(key: string, param: string = null): Observable<string> {
    return this.translate.get(key, { value: param });
  }
}
