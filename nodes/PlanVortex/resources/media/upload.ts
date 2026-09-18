import type { IDataObject, INodeProperties } from 'n8n-workflow';
import { planVortexApiRequest } from '../../transport';
import { getOrganizationId, type OperationHandler } from '../helpers';

const showOnlyForMediaUpload = {
	resource: ['media'],
	operation: ['upload'],
};

export const mediaUploadDescription: INodeProperties[] = [
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: { show: showOnlyForMediaUpload },
		hint: 'The name of the input field containing the file to upload',
		description:
			'Which binary field of the incoming item holds the file. Nodes that download or read a file put it in a field called data unless they were told otherwise.',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showOnlyForMediaUpload },
		options: [
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: '',
				description:
					'Overrides the name the file travels with. PlanVortex decides what kind of file it is from the content type, and derives that from the name when the source did not declare one, so a name without an extension is worth fixing here.',
			},
		],
	},
];

/**
 * Upload one file to the organization's library.
 *
 * The endpoint is `multipart/form-data` with a single field called `file`, and in n8n a file is
 * never a path on disk: it arrives as binary data on the item. Both halves of that are easy to get
 * wrong, and this is the operation everybody tries first.
 *
 * It travels with `json: false`, which is the only way a `FormData` body survives the helper — the
 * flag that serializes the request is the same one that parses the response, which is why the
 * transport normalises the answer.
 *
 * What comes back is the upload, and its `_id` is what a publication attaches. Note that the
 * `public_path` on it is a signed URL that expires within the hour: it is for looking at, not for
 * storing.
 */
export const uploadMedia: OperationHandler = async function (this, index) {
	const organizationId = getOrganizationId(this, index);
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', index, 'data') as string;
	const options = this.getNodeParameter('options', index, {}) as IDataObject;

	const binary = this.helpers.assertBinaryData(index, binaryPropertyName);
	const buffer = await this.helpers.getBinaryDataBuffer(index, binaryPropertyName);
	const fileName = String(options.fileName ?? binary.fileName ?? 'file');
	const mimeType = binary.mimeType || 'application/octet-stream';

	const form = new FormData();
	form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);

	const response = (await planVortexApiRequest.call(
		this,
		'POST',
		`/organizations/${organizationId}/uploads`,
		undefined,
		undefined,
		{ body: form, json: false },
	)) as { upload?: IDataObject };

	return [response?.upload ?? {}];
};
