import { User } from 'src/app/domain/entities/users/user.model';
import { AuthModel } from './auth.model';
import { StoreModuleFeatures } from './store-module-features.model';


export class UserModel extends AuthModel implements User {
  id: string;
  fullName: string;
  cellPhone: string;
  email: string;
  isActive: boolean;
  // TODO. Remove
  password: string;
  roles: StoreModuleFeatures[];
  featureIds: number[] = [];
  isSuperAdmin: boolean = false;
  isOwnerAdmin: boolean = false;
  isReSeller: boolean = false;
  selectedStoreId: string;

  setUser(user: any) {
    this.id = user.id;
    this.login = user.login || '';
    this.fullName = user.fullName || '';
    this.cellPhone = user.cellPhone || '';
    this.email = user.email || '';
  }
}
