export interface IBaseState {
  selectedRowIds: Set<string>;
  itemIds: string[];
  checkAreAllRowsSelected(): boolean;
  selectRow(id: string): IBaseState;
  // tslint:disable-next-line:variable-name
  clearRows(_itemIds: string[]): IBaseState;

  isRowSelected(id: string): boolean;
  selectAllRows(): IBaseState;
  getSelectedRows(): string[];
  getSelectedRowsCount(): number;

  //entityId: string | undefined;
}


export class BaseState implements IBaseState {
  selectedRowIds: Set<string> = new Set<string>();
  itemIds = [];

  checkAreAllRowsSelected(): boolean {
    if (this.itemIds.length === 0) {
      return false;
    }

    return this.selectedRowIds.size === this.itemIds.length;
  }

  selectRow(id: string): BaseState {
    if (this.selectedRowIds.has(id)) {
      this.selectedRowIds.delete(id);
    } else {
      this.selectedRowIds.add(id);
    }
    return this;
  }

  // tslint:disable-next-line:variable-name
  clearRows(_itemIds: string[]): BaseState {
    this.itemIds = _itemIds;
    this.selectedRowIds = new Set<string>();
    return this;
  }

  isRowSelected(id: string): boolean {
    return this.selectedRowIds.has(id);
  }

  selectAllRows(): BaseState {
    const areAllSelected = this.itemIds.length === this.selectedRowIds.size;
    if (areAllSelected) {
      this.selectedRowIds = new Set<string>();
    } else {
      this.selectedRowIds = new Set<string>();
      this.itemIds.forEach(id => this.selectedRowIds.add(id));
    }
    return this;
  }

  getSelectedRows(): string[] {
    return Array.from(this.selectedRowIds);
  }

  getSelectedRowsCount(): number {
    return this.selectedRowIds.size;
  }
}

export interface IStateView {
  baseState: BaseState;
  ngOnInit(): void;
}
