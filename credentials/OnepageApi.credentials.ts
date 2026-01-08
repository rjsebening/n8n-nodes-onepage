import type {
	ICredentialType,
	INodeProperties,
	ICredentialTestRequest,
	Icon,
} from 'n8n-workflow';

export class OnepageApi implements ICredentialType {
	name = 'onepageApi';
	displayName = 'OnePage API';
	icon: Icon = 'file:onepage.svg';
	documentationUrl =
		'https://github.com/rjsebening/n8n-nodes-onepage/blob/main/CREDENTIALS.md';

	properties: INodeProperties[] = [
		{
			displayName: 'Email',
			name: 'email',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
	];

	test: ICredentialTestRequest = {
		request: {
			method: 'POST',
			url: 'https://auth.onepage.io/login',
			body: {
				email: '={{$credentials.email}}',
				password: '={{$credentials.password}}',
			},
			json: true,
		},
	};
}
