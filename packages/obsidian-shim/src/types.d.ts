declare module "js-yaml" {
	function load(str: string, opts?: any): any;
	function dump(obj: any, opts?: any): string;
	export { load, dump };
	export default load;
}
