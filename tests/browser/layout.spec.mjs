import {test,expect} from '@playwright/test';
import {mockBackend} from './mock-backend.mjs';
import fs from 'node:fs/promises';

for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
 test(`${device} checkout preserves theme, layout and current keyboard state`,async({page})=>{
   await page.setViewportSize(viewport);
   await mockBackend(page);
   await page.goto('/pos');
   await expect(page.getByText(/Day open ·/)).toBeVisible();
   if(device==='desktop'){
     const sidebar=page.locator('[data-sidebar="sidebar"]').first();
     await expect(sidebar).toBeVisible();
     expect((await sidebar.boundingBox()).width).toBeGreaterThan(200);
   }
   await page.getByText('Test Product',{exact:true}).click();
   await page.keyboard.press('F9');
   const dialog=page.getByRole('dialog');
   await expect(dialog).toBeVisible();
   await expect(dialog.getByRole('button',{name:'Complete & Print'})).toBeVisible();
   const box=await dialog.boundingBox();
   expect(box.x).toBeGreaterThanOrEqual(-1);
   expect(box.x+box.width).toBeLessThanOrEqual(viewport.width+1);
   const light=await dialog.evaluate(el=>getComputedStyle(el).backgroundColor);
   expect(light).not.toBe('rgba(0, 0, 0, 0)');
   await fs.mkdir('tests/.artifacts/visual',{recursive:true});
   await page.screenshot({path:`tests/.artifacts/visual/${device}-checkout-light.png`});
   await page.evaluate(()=>document.documentElement.classList.add('dark'));
   await expect.poll(()=>dialog.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(light);
   await page.screenshot({path:`tests/.artifacts/visual/${device}-checkout-dark.png`});
 });
}
