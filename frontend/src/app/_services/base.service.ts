// tslint:disable:variable-name
import { HttpClient } from "@angular/common/http";
import { BehaviorSubject, Observable, of, Subscription } from "rxjs";
import { catchError, finalize, tap } from "rxjs/operators";
import { BaseError, BaseModel, BaseResponseModel, IModelState } from "./_models/base.model";
import { environment } from "../../environments/environment";
import { BaseState } from "./_models/base-state.model";

const DEFAULT_STATE: IModelState = {
  baseState: new BaseState,
  entityId: undefined,
};

export abstract class BaseService<T> {
  // Private fields
  private _items$ = new BehaviorSubject<T[]>([]);
  private _isFirstLoading$ = new BehaviorSubject<boolean>(true);
  private _modelState$ = new BehaviorSubject<IModelState>(DEFAULT_STATE);

  // Protected fields
  protected _errorMessage = new BehaviorSubject<string>("");
  protected _isLoading$ = new BehaviorSubject<boolean>(false);
  protected _subscriptions: Subscription[] = [];
  protected http: HttpClient;

  // Getters
  get items$() {
    return this._items$.asObservable();
  }
  get isLoading$() {
    return this._isLoading$.asObservable();
  }
  get isFirstLoading$() {
    return this._isFirstLoading$.asObservable();
  }
  get errorMessage$() {
    return this._errorMessage.asObservable();
  }
  get subscriptions() {
    return this._subscriptions;
  }

  // State getters  
  get baseState() {
    return this._modelState$.value.baseState;
  }

  // API URL has to be overrided
  API_URL = `${environment.apiUrl}/endpoint`;
  constructor(http: HttpClient) {
    this.http = http;
  }

  // CREATE
  // server should return the object with ID
  create(item: BaseModel): Observable<BaseModel> {
    this._isLoading$.next(true);
    this._errorMessage.next("");
    return this.http.post<BaseModel>(this.API_URL, item).pipe(
      catchError((err) => {
        this._errorMessage.next(err);
        console.error("CREATE ITEM", err);
        return of({ id: undefined });
      }),
      finalize(() => this._isLoading$.next(false))
    );
  }

  // READ (Returning list of entities)
  getAllItems(): Observable<BaseResponseModel<T>> {
    const url = this.API_URL + "all";
    this._errorMessage.next("");
    return this.http.get<any>(url + '/' + false, ).pipe(
      catchError((err) => {
        this._errorMessage.next(err);
        console.error("FIND ITEMS", err);
        return of({ items: [], total: 0 });
      })
    );
  }

  getItemById(id: string): Observable<BaseModel> {
    this._isLoading$.next(true);
    this._errorMessage.next("");
    const url = `${this.API_URL}/${id}`;
    return this.http.get<BaseModel>(url).pipe(
      catchError((err) => {
        this._errorMessage.next(err);
        console.error("GET ITEM BY IT", id, err);
        return of({ id: undefined });
      }),
      finalize(() => this._isLoading$.next(false))
    );
  }

  // UPDATE
  update(item: BaseModel): Observable<any> {
    const url = `${this.API_URL}/${item.id}`;
    this._isLoading$.next(true);
    this._errorMessage.next("");
    return this.http.put(url, item).pipe(
      catchError((err) => {
        this._errorMessage.next(err);
        console.error("UPDATE ITEM", item, err);
        return of(item);
      }),
      finalize(() => this._isLoading$.next(false))
    );
  }

  // UPDATE Status
  updateStatusForItems(ids: number[], status: number): Observable<any> {
    this._isLoading$.next(true);
    this._errorMessage.next("");
    const body = { ids, status };
    const url = this.API_URL + "/updateStatus";
    return this.http.put(url, body).pipe(
      catchError((err) => {
        this._errorMessage.next(err);
        console.error("UPDATE STATUS FOR SELECTED ITEMS", ids, status, err);
        return of([]);
      }),
      finalize(() => this._isLoading$.next(false))
    );
  }

  // DELETE
  delete(id: any): Observable<any> {
    this._isLoading$.next(true);
    this._errorMessage.next("");
    const url = `${this.API_URL}/${id}`;
    return this.http.delete(url).pipe(
      catchError((err) => {
        this._errorMessage.next(err);
        console.error("DELETE ITEM", id, err);
        return of({});
      }),
      finalize(() => this._isLoading$.next(false))
    );
  }

  // delete list of items
  deleteItems(ids: number[] = []): Observable<any> {
    this._isLoading$.next(true);
    this._errorMessage.next("");
    const url = this.API_URL + "/deleteItems";
    const body = { ids };
    return this.http.put(url, body).pipe(
      catchError((err) => {
        this._errorMessage.next(err);
        console.error("DELETE SELECTED ITEMS", ids, err);
        return of([]);
      }),
      finalize(() => this._isLoading$.next(false))
    );
  }

  public fetch() {
    this._isLoading$.next(true);
    this._errorMessage.next("");
    const request = this.getAllItems()
      .pipe(
        tap((res: any) => {
          this._items$.next(res.data);
        }),
        catchError((err) => {
          this._errorMessage.next(err);
          return of({
            items: []
          });
        }),
        finalize(() => {
          this._isLoading$.next(false);
          const itemIds = this._items$.value.map((el: T) => {
            const item = el as unknown as BaseModel;
            return item.id;
          });
          this.patchStateWithoutFetch({
            baseState: this._modelState$.value.baseState.clearRows(itemIds),
          });
        })
      )
      .subscribe();
    this._subscriptions.push(request);
  }

  public setDefaults() {
    this._isFirstLoading$.next(true);
    this._isLoading$.next(true);
    this._errorMessage.next("");
  }

  // Base Methods
  public patchState(patch: Partial<IModelState>) {
    this.patchStateWithoutFetch(patch);
    this.fetch();
  }

  public patchStateWithoutFetch(patch: Partial<IModelState>) {
    const newState = Object.assign(this._modelState$.value, patch);
    this._modelState$.next(newState);
  }

  public Success<TData>(data: TData): BaseResponseModel<TData> {
    return {
      data: data,
      succeeded: true,
      message: "",
      actionCode: 200,
      errors: [],
    };
  }

  public Success$<TData>(data: TData): Observable<BaseResponseModel<TData>> {
    return of(this.Success(data));
  }

  public Failure<TData>(errors: BaseError[]): BaseResponseModel<TData> {
    return {
      data: null,
      succeeded: false,
      message: "",
      actionCode: 400,
      errors: errors,
    };
  }

  public Failure$<TData>(errors: BaseError[]): Observable<BaseResponseModel<TData>> {
    return of({
      data: null,
      succeeded: false,
      message: "",
      actionCode: 400,
      errors: errors,
    });
  }
}
