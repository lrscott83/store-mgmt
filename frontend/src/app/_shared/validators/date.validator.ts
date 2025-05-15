import { Injectable }       from '@angular/core';
import { AbstractControl, ValidatorFn, FormControl, FormGroupDirective, NgForm }  from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';

@Injectable({
  providedIn : 'root'
})
export class DateValidators
{
  constructor() {}

  public static lessThanOrEqualsValidator(fromDateField: string, toDateField: string, 
      errorName: string = 'fromToDate') : ValidatorFn
  {
    return (formGroup: AbstractControl): { [key: string]: boolean } | null => {
        if (!formGroup.get(fromDateField) || !formGroup.get(fromDateField).value
            || !formGroup.get(toDateField) || !formGroup.get(toDateField).value)
            return null;
        const fromDate = formGroup.get(fromDateField).value;
        const toDate = formGroup.get(toDateField).value;
       // Ausing the fromDate and toDate are numbers. In not convert them first after null check
        if ((fromDate !== null && toDate !== null) && fromDate > toDate) {
            return {[errorName]: true};
        }
        return null;
    };
  }
}

export class ConfirmValidParentMatcher implements ErrorStateMatcher {
    isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
        return control.parent.invalid && control.touched;
    }
}