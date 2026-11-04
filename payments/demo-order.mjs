// Used by both demo merchant servers. Delivery details are validated in memory only.
export function demoSelection(details) {
 if(details===undefined)return null; // Previously issued orders and API clients.
 if(!details||typeof details!=='object'||!['XS','S','M','L','XL','XXL'].includes(details.jacket)||
   !['name','street','city','country'].every(k=>typeof details[k]==='string'&&details[k].trim().length>0&&details[k].length<=100)||
   !['phone','postal'].every(k=>details[k]===undefined||typeof details[k]==='string'&&details[k].length<=100))throw Error('Review the jacket size and delivery details.');
 if(!['looku',null].includes(details.referral??null))throw Error('Unknown referral.');
 return {variant:'cropped-jacket-'+details.jacket.toLowerCase(),size:details.jacket,referral:details.referral||null};
}
