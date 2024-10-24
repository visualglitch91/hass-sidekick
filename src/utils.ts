import { Observable, OperatorFunction, iif, of } from "rxjs";
import { mergeMap, switchMap } from "rxjs/operators";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function includesEntityId(
  entityId: string,
  stringOrArray: string | string[]
) {
  if (typeof stringOrArray === "string") {
    return entityId === stringOrArray;
  }

  return stringOrArray.includes(entityId);
}

export function pollUntilTrue(
  asyncFunc: () => Promise<boolean>,
  interval: number,
  timeout: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkCondition = async () => {
      try {
        const result = await asyncFunc();

        if (result) {
          resolve();
        } else if (Date.now() - startTime >= timeout) {
          reject(
            new Error("Timeout: Condition was not met within the allowed time.")
          );
        } else {
          setTimeout(checkCondition, interval);
        }
      } catch (error) {
        reject(error);
      }
    };

    checkCondition();
  });
}

export function isReturnStable<T>(func: () => T, x: number): Promise<boolean> {
  const initialResult = func();

  return new Promise<boolean>((resolve) => {
    if (x < 100) {
      // If x is less than 100ms, just check once and return the result.
      setTimeout(() => {
        const newResult = func();
        resolve(initialResult === newResult);
      }, x);
    } else {
      const interval = setInterval(() => {
        const newResult = func();
        if (initialResult !== newResult) {
          clearInterval(interval);
          resolve(false);
        }
      }, 100);

      // Stop checking after x milliseconds and resolve true if no changes.
      setTimeout(() => {
        clearInterval(interval);
        resolve(true);
      }, x);
    }
  });
}

export const NULL$ = of(null);

/**
 * Helper function to switch between two observables based on a condition.
 * @param conditionFn - A function that takes the context and returns a boolean indicating which observable to use.
 * @param trueObservableFn - A function that takes the context and returns the observable to use if the condition is true.
 * @param falseObservableFn - A function that takes the context and returns the observable to use if the condition is false.
 * @returns A function that takes an observable `context` and returns an observable based on the condition.
 */
export function branch<T>(
  conditionFn: (context: T) => boolean,
  trueObservableFn: null | ((context: T) => Observable<any>),
  falseObservableFn?: null | ((context: T) => Observable<any>)
): (source: Observable<T>) => Observable<any> {
  return switchMap((context: T) =>
    iif(
      () => conditionFn(context),
      trueObservableFn ? trueObservableFn(context) : NULL$,
      falseObservableFn ? falseObservableFn(context) : NULL$
    )
  );
}

export function observable<T>(func: (next: (param: T) => void) => void) {
  const observable = new Observable<T>((sub) => {
    func((param: T) => sub.next(param));
  });

  return observable;
}

type SyncOrAsync<T> = T | Promise<T>;

export function call<T, P extends any[], R>(
  func: (...args: P) => SyncOrAsync<R>,
  ...args: P
): OperatorFunction<T, T> {
  return (source: Observable<T>) =>
    source.pipe(
      mergeMap(async (value: T) => {
        // Call the function with the provided arguments (for side effects)
        await func(...args);
        // Return the original value
        return value;
      })
    );
}
