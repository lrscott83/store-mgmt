import { Injectable }  from '@angular/core';
import { AuthService } from './services.index';
 
@Injectable()
export class AppInitService {
 
    constructor(private authService: AuthService) {
    }
    
    Init() {
        return new Promise<void>((resolve, reject) => {
            try {
                this.authService.getUserByToken().subscribe().add(resolve);
            }
            catch (exception) {
                console.log(JSON.stringify(exception));
            }
        });
    }
}