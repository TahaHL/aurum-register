import {test,expect} from '@playwright/test';
test('view switcher opens owner admin and returns to the customer store',async({page})=>{
 await page.goto('/account');
 await page.locator('.view-switcher summary').click();
 await page.getByRole('button',{name:'Owner demo · Admin'}).click();
 await expect(page.getByRole('heading',{name:'Trading performance'})).toBeVisible();
 await page.getByRole('button',{name:'Gross profit',exact:true}).click();
 await expect(page.getByRole('button',{name:'Gross profit',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByLabel('Inspect day').fill('3');
 await expect(page.locator('.ops-inspect output')).not.toContainText('Drag');
 await page.getByRole('button',{name:'All orders →'}).click();
 await expect(page.getByRole('heading',{name:'Orders',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Hadj Lakehal Metals admin home',exact:true}).click();
 await expect(page).toHaveURL(/\/admin$/);
 await page.locator('.view-switcher summary').click();
 await page.getByRole('link',{name:'Customer store Browse metals, prices and your basket'}).click();
 await expect(page.getByRole('heading',{name:'Precious metals. A clearer perspective.'})).toBeVisible();
});
