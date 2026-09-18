import type { INodeProperties } from 'n8n-workflow';

/**
 * The organization, asked once for the whole node.
 *
 * Six of the seven operations need it, so it is declared here and hidden for the seventh rather
 * than copied six times: six copies of a parameter are six chances for one of them to drift into
 * a different name, and the name is what `execute` reads.
 *
 * The sentence at the end of its description is not padding and cannot be factored into a
 * constant. n8n's lint requires that exact wording on any parameter whose options are loaded from
 * an API — "Choose from the list, or specify an ID using an expression", with the link — and it
 * reads the source, not the running value: a template literal that produces the right string is
 * still reported, because the rule only sees an expression where it wanted a literal. So it is
 * written out, here and in every other dynamic parameter of this package.
 */
export const organizationIdProperty: INodeProperties = {
	displayName: 'Organization Name or ID',
	name: 'organizationId',
	type: 'options',
	typeOptions: {
		loadOptionsMethod: 'getOrganizations',
	},
	default: '',
	required: true,
	displayOptions: {
		hide: {
			resource: ['socialNetwork'],
		},
	},
	description: 'The PlanVortex organization this operation works on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
};
